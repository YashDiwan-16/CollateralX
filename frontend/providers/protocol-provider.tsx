"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { useWallet } from "@txnlab/use-wallet-react"
import { getProtocolConfig, hasRequiredChainConfig } from "@/lib/contracts/config"
import {
  createVaultOnChain,
  depositCollateralOnChain,
  liquidateVaultOnChain,
  loadProtocolSnapshot,
  mintStablecoinOnChain,
  repayStablecoinOnChain,
  withdrawCollateralOnChain,
} from "@/lib/contracts/repository"
import { DEMO_OWNER_ADDRESS, PROTOCOL_PAUSE_FLAGS } from "@/lib/protocol/constants"
import { buildSnapshotFromVaults, createMockSnapshot } from "@/lib/protocol/mock-data"
import {
  enrichVault,
  isOracleStale,
  maxSafeDebtMicroStable,
  projectVaultAction,
} from "@/lib/protocol/math"
import type {
  ProtocolAction,
  ProtocolActionResult,
  ProtocolActions,
  ProtocolSnapshot,
  VaultView,
} from "@/lib/protocol/types"

interface ProtocolContextValue {
  snapshot: ProtocolSnapshot
  loading: boolean
  error: string | null
  lastResult: ProtocolActionResult | null
  pendingAction: ProtocolAction | null
  activeAddress?: string | null
  refresh(): Promise<void>
  actions: ProtocolActions
}

const ProtocolContext = createContext<ProtocolContextValue | null>(null)

function paused(flags: bigint, actionFlag: bigint) {
  return (flags & PROTOCOL_PAUSE_FLAGS.emergency) !== 0n || (flags & actionFlag) !== 0n
}

function assertAmount(amount: bigint, label: string) {
  if (amount <= 0n) throw new Error(`${label} must be greater than zero`)
}

function assertFreshOracle(snapshot: ProtocolSnapshot) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  if (
    isOracleStale(
      now,
      snapshot.oracle.updatedAt,
      snapshot.oracle.maxAgeSeconds,
      snapshot.oracle.isFresh
    )
  ) {
    throw new Error("Oracle price is stale. Wait for a fresh update before submitting this action.")
  }
}

function findOwnedVault(snapshot: ProtocolSnapshot, vaultId: bigint, owner: string) {
  const vault = snapshot.vaults.find((candidate) => candidate.id === vaultId)
  if (!vault) throw new Error("Vault not found")
  if (vault.owner !== owner) throw new Error("Only the vault owner can perform this action")
  return vault
}

function mockTxId(action: ProtocolAction, vaultId?: bigint) {
  const suffix = vaultId ? vaultId.toString().padStart(4, "0") : "0000"
  return `mock-${action}-${suffix}-${Date.now().toString(36)}`
}

function rebuild(snapshot: ProtocolSnapshot, owner: string, vaults: VaultView[], warning?: string) {
  return buildSnapshotFromVaults({
    vaults,
    owner,
    params: snapshot.params,
    oracle: snapshot.oracle,
    stablecoin: snapshot.stablecoin,
    mode: snapshot.mode,
    network: snapshot.network,
    warnings: warning ? [warning] : snapshot.warnings,
  })
}

function updateVault(snapshot: ProtocolSnapshot, owner: string, updatedVault: VaultView) {
  return rebuild(
    snapshot,
    owner,
    snapshot.vaults.map((vault) => (vault.id === updatedVault.id ? updatedVault : vault))
  )
}

export function ProtocolProvider({ children }: { children: React.ReactNode }) {
  const { activeAddress, transactionSigner } = useWallet()
  const config = getProtocolConfig()
  const owner = activeAddress ?? DEMO_OWNER_ADDRESS
  const [snapshot, setSnapshot] = useState<ProtocolSnapshot>(() => createMockSnapshot(owner))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<ProtocolActionResult | null>(null)
  const [pendingAction, setPendingAction] = useState<ProtocolAction | null>(null)

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      const next = await loadProtocolSnapshot({ config, activeAddress, transactionSigner })
      const chainWarning =
        config.dataMode === "chain" && !hasRequiredChainConfig(config)
          ? "Chain mode is selected, but app ids are missing. Showing mock data until deployment values are configured."
          : undefined
      setSnapshot(chainWarning ? { ...next, warnings: [chainWarning, ...next.warnings] } : next)
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Unable to load protocol state"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // Wallet address changes are the intended refresh trigger. The wallet signer
    // function can be a fresh reference on every render, which would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAddress])

  async function runAction<T extends ProtocolActionResult>(
    action: ProtocolAction,
    work: () => Promise<T>
  ) {
    setPendingAction(action)
    setError(null)
    try {
      const result = await work()
      setLastResult(result)
      return result
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Transaction failed"
      setError(message)
      throw actionError
    } finally {
      setPendingAction(null)
    }
  }

  const actions: ProtocolActions = {
    async createVault(input = {}) {
      return runAction("createVault", async () => {
        if (config.dataMode === "chain" && hasRequiredChainConfig(config)) {
          const result = await createVaultOnChain({ config, activeAddress, transactionSigner }, input)
          await refresh()
          return result
        }

        if (paused(snapshot.status.pauseFlags, PROTOCOL_PAUSE_FLAGS.createVault)) {
          throw new Error("Vault creation is paused")
        }
        if (input.initialMintMicroStable && input.initialMintMicroStable > 0n) assertFreshOracle(snapshot)

        const vaultId = snapshot.status.nextVaultId
        const initialCollateral = input.initialCollateralMicroAlgo ?? 0n
        const initialMint = input.initialMintMicroStable ?? 0n
        const totalDebt = snapshot.status.totalDebtMicroStable + initialMint
        const vault = enrichVault({
          id: vaultId,
          owner,
          collateralMicroAlgo: initialCollateral,
          debtMicroStable: initialMint,
          createdAt: BigInt(Math.floor(Date.now() / 1000)),
          updatedAt: BigInt(Math.floor(Date.now() / 1000)),
          version: 1n,
          params: snapshot.params,
          pricePerAlgoMicroUsd: snapshot.oracle.pricePerAlgoMicroUsd,
          totalDebtMicroStable: totalDebt,
        })

        const maxInitialDebt = maxSafeDebtMicroStable(
          initialCollateral,
          snapshot.oracle.pricePerAlgoMicroUsd,
          snapshot.params.minCollateralRatioBps
        )
        if (initialMint > maxInitialDebt) {
          throw new Error("Initial mint would make the vault unhealthy")
        }
        if (initialMint > snapshot.params.vaultMintCapMicroStable) {
          throw new Error("Per-vault debt ceiling exceeded")
        }
        if (totalDebt > snapshot.params.protocolDebtCeilingMicroStable) {
          throw new Error("Protocol debt ceiling exceeded")
        }

        setSnapshot(rebuild(snapshot, owner, [vault, ...snapshot.vaults]))
        return {
          txId: mockTxId("createVault", vaultId),
          vaultId,
          simulated: true,
          message: `Vault #${vault.displayId} created in demo mode`,
        }
      })
    },

    async depositCollateral(vaultId, amountMicroAlgo) {
      return runAction("deposit", async () => {
        assertAmount(amountMicroAlgo, "Deposit amount")
        if (config.dataMode === "chain" && hasRequiredChainConfig(config)) {
          const result = await depositCollateralOnChain({ config, activeAddress, transactionSigner }, vaultId, amountMicroAlgo)
          await refresh()
          return result
        }
        if (paused(snapshot.status.pauseFlags, PROTOCOL_PAUSE_FLAGS.deposit)) throw new Error("Collateral deposits are paused")
        const vault = findOwnedVault(snapshot, vaultId, owner)
        const next = projectVaultAction(vault, "deposit", amountMicroAlgo, snapshot.params, snapshot.oracle.pricePerAlgoMicroUsd, snapshot.status.totalDebtMicroStable)
        setSnapshot(updateVault(snapshot, owner, next))
        return { txId: mockTxId("deposit", vaultId), vaultId, simulated: true, message: "Collateral deposit pre-check passed" }
      })
    },

    async mintStablecoin(vaultId, amountMicroStable) {
      return runAction("mint", async () => {
        assertAmount(amountMicroStable, "Mint amount")
        assertFreshOracle(snapshot)
        if (config.dataMode === "chain" && hasRequiredChainConfig(config)) {
          const result = await mintStablecoinOnChain({ config, activeAddress, transactionSigner }, vaultId, amountMicroStable)
          await refresh()
          return result
        }
        if (paused(snapshot.status.pauseFlags, PROTOCOL_PAUSE_FLAGS.mint)) throw new Error("Minting is paused")
        const vault = findOwnedVault(snapshot, vaultId, owner)
        if (amountMicroStable > vault.maxMintableMicroStable) throw new Error("Mint amount exceeds safe limit")
        if (snapshot.status.totalDebtMicroStable + amountMicroStable > snapshot.params.protocolDebtCeilingMicroStable) {
          throw new Error("Protocol debt ceiling exceeded")
        }
        const next = projectVaultAction(vault, "mint", amountMicroStable, snapshot.params, snapshot.oracle.pricePerAlgoMicroUsd, snapshot.status.totalDebtMicroStable)
        setSnapshot(updateVault(snapshot, owner, next))
        return { txId: mockTxId("mint", vaultId), vaultId, simulated: true, message: "Mint simulation passed and algoUSD minted" }
      })
    },

    async repayStablecoin(vaultId, amountMicroStable) {
      return runAction("repay", async () => {
        assertAmount(amountMicroStable, "Repay amount")
        if (config.dataMode === "chain" && hasRequiredChainConfig(config)) {
          const result = await repayStablecoinOnChain({ config, activeAddress, transactionSigner }, vaultId, amountMicroStable)
          await refresh()
          return result
        }
        if (paused(snapshot.status.pauseFlags, PROTOCOL_PAUSE_FLAGS.repay)) throw new Error("Repayments are paused")
        const vault = findOwnedVault(snapshot, vaultId, owner)
        if (amountMicroStable > vault.debtMicroStable) throw new Error("Repay amount exceeds outstanding debt")
        const next = projectVaultAction(vault, "repay", amountMicroStable, snapshot.params, snapshot.oracle.pricePerAlgoMicroUsd, snapshot.status.totalDebtMicroStable)
        setSnapshot(updateVault(snapshot, owner, next))
        return { txId: mockTxId("repay", vaultId), vaultId, simulated: true, message: "Repayment accepted" }
      })
    },

    async withdrawCollateral(vaultId, amountMicroAlgo) {
      return runAction("withdraw", async () => {
        assertAmount(amountMicroAlgo, "Withdraw amount")
        assertFreshOracle(snapshot)
        if (config.dataMode === "chain" && hasRequiredChainConfig(config)) {
          const result = await withdrawCollateralOnChain({ config, activeAddress, transactionSigner }, vaultId, amountMicroAlgo)
          await refresh()
          return result
        }
        if (paused(snapshot.status.pauseFlags, PROTOCOL_PAUSE_FLAGS.withdraw)) throw new Error("Withdrawals are paused")
        const vault = findOwnedVault(snapshot, vaultId, owner)
        if (amountMicroAlgo > vault.maxWithdrawableMicroAlgo) throw new Error("Withdrawal would make the vault unhealthy")
        const next = projectVaultAction(vault, "withdraw", amountMicroAlgo, snapshot.params, snapshot.oracle.pricePerAlgoMicroUsd, snapshot.status.totalDebtMicroStable)
        const nextVaults = next.debtMicroStable === 0n && next.collateralMicroAlgo === 0n
          ? snapshot.vaults.filter((candidate) => candidate.id !== vaultId)
          : snapshot.vaults.map((candidate) => (candidate.id === vaultId ? next : candidate))
        setSnapshot(rebuild(snapshot, owner, nextVaults))
        return { txId: mockTxId("withdraw", vaultId), vaultId, simulated: true, message: "Withdrawal pre-check passed" }
      })
    },

    async liquidateVault(vaultId) {
      return runAction("liquidate", async () => {
        assertFreshOracle(snapshot)
        if (config.dataMode === "chain" && hasRequiredChainConfig(config)) {
          const result = await liquidateVaultOnChain({ config, activeAddress, transactionSigner }, snapshot, vaultId)
          await refresh()
          return result
        }
        if (paused(snapshot.status.pauseFlags, PROTOCOL_PAUSE_FLAGS.liquidate)) throw new Error("Liquidations are paused")
        const vault = snapshot.vaults.find((candidate) => candidate.id === vaultId)
        if (!vault) throw new Error("Vault not found")
        if (!vault.isLiquidatable) throw new Error("Vault is not eligible for liquidation")
        setSnapshot(rebuild(snapshot, owner, snapshot.vaults.filter((candidate) => candidate.id !== vaultId)))
        return { txId: mockTxId("liquidate", vaultId), vaultId, simulated: true, message: "Liquidation simulation passed" }
      })
    },
  }

  return (
    <ProtocolContext.Provider
      value={{
        snapshot,
        loading,
        error,
        lastResult,
        pendingAction,
        activeAddress,
        refresh,
        actions,
      }}
    >
      {children}
    </ProtocolContext.Provider>
  )
}

export function useProtocol() {
  const context = useContext(ProtocolContext)
  if (!context) throw new Error("useProtocol must be used inside ProtocolProvider")
  return context
}
