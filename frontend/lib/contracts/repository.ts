import algosdk from "algosdk"
import { AlgorandClient, microAlgo } from "@algorandfoundation/algokit-utils"
import { DEMO_OWNER_ADDRESS } from "@/lib/protocol/constants"
import {
  buildSnapshotFromVaults,
  createMockSnapshot,
  defaultProtocolParams,
} from "@/lib/protocol/mock-data"
import { enrichVault } from "@/lib/protocol/math"
import type {
  CreateVaultInput,
  ProtocolActionResult,
  ProtocolConfig,
  ProtocolSnapshot,
} from "@/lib/protocol/types"
import { hasRequiredChainConfig } from "@/lib/contracts/config"
import { ownerVaultBox, vaultBox, vaultLifecycleBoxes } from "@/lib/contracts/boxes"
import { CollateralXProtocolManagerFactory } from "@/lib/contracts/generated/CollateralXProtocolManagerClient"
import { CollateralXOracleAdapterFactory } from "@/lib/contracts/generated/CollateralXOracleAdapterClient"
import { CollateralXStablecoinControllerFactory } from "@/lib/contracts/generated/CollateralXStablecoinControllerClient"

interface RepositoryContext {
  config: ProtocolConfig
  activeAddress?: string | null
  transactionSigner?: algosdk.TransactionSigner | null
}

function toAddress(value?: string | null) {
  return value ? algosdk.Address.fromString(value) : undefined
}

function makeAlgorand(config: ProtocolConfig, activeAddress?: string | null, signer?: algosdk.TransactionSigner | null) {
  const algorand = AlgorandClient.fromClients({
    algod: new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort),
    indexer: new algosdk.Indexer(config.indexerToken, config.indexerServer, config.indexerPort),
  })

  const address = toAddress(activeAddress)
  if (address && signer) {
    algorand.setSigner(address, signer)
  }

  return algorand
}

function getClients(ctx: RepositoryContext) {
  if (!ctx.config.protocolAppId) throw new Error("Protocol app id is not configured")

  const algorand = makeAlgorand(ctx.config, ctx.activeAddress, ctx.transactionSigner)
  const defaultSenderAddress =
    toAddress(ctx.activeAddress) ??
    toAddress(ctx.config.keeperAddress) ??
    algosdk.Address.fromString(DEMO_OWNER_ADDRESS)
  const protocol = new CollateralXProtocolManagerFactory({ algorand, defaultSender: defaultSenderAddress }).getAppClientById({
    appId: ctx.config.protocolAppId,
    defaultSender: defaultSenderAddress,
  })
  const oracle =
    ctx.config.oracleAppId &&
    new CollateralXOracleAdapterFactory({ algorand, defaultSender: defaultSenderAddress }).getAppClientById({
      appId: ctx.config.oracleAppId,
      defaultSender: defaultSenderAddress,
    })
  const stablecoin =
    ctx.config.stablecoinAppId &&
    new CollateralXStablecoinControllerFactory({ algorand, defaultSender: defaultSenderAddress }).getAppClientById({
      appId: ctx.config.stablecoinAppId,
      defaultSender: defaultSenderAddress,
    })

  return { algorand, protocol, oracle, stablecoin, defaultSender: defaultSenderAddress.toString() }
}

function bytesToUtf8(value: Uint8Array | string) {
  if (typeof value === "string") return value
  return new TextDecoder().decode(value)
}

function txIdFromResult(result: unknown) {
  const shaped = result as {
    txIds?: string[]
    transaction?: { txID?: () => string }
    transactions?: Array<{ txID?: () => string }>
  }
  return (
    shaped.txIds?.[0] ??
    shaped.transaction?.txID?.() ??
    shaped.transactions?.[0]?.txID?.() ??
    "submitted"
  )
}

export async function loadProtocolSnapshot(ctx: RepositoryContext): Promise<ProtocolSnapshot> {
  const owner = ctx.activeAddress ?? DEMO_OWNER_ADDRESS

  if (ctx.config.dataMode === "mock" || !hasRequiredChainConfig(ctx.config)) {
    return createMockSnapshot(owner)
  }

  try {
    return await loadChainSnapshot(ctx)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chain read error"
    const fallback = createMockSnapshot(owner)
    return {
      ...fallback,
      mode: "mock",
      warnings: [`Using mock data because chain state could not be read: ${message}`],
    }
  }
}

async function loadChainSnapshot(ctx: RepositoryContext): Promise<ProtocolSnapshot> {
  const { protocol, oracle, stablecoin, defaultSender } = getClients(ctx)
  if (!oracle || !stablecoin) throw new Error("Oracle and stablecoin app ids are required")
  const snapshotOwner = ctx.activeAddress ?? DEMO_OWNER_ADDRESS

  const [status, params, oracleSample, stablecoinState] = await Promise.all([
    protocol.readProtocolStatus(),
    protocol.readProtocolParams(),
    oracle.readOraclePrice(),
    stablecoin.readStablecoinControlState(),
  ])

  const protocolParams = {
    minCollateralRatioBps: params.minCollateralRatioBps,
    liquidationRatioBps: params.liquidationRatioBps,
    liquidationPenaltyBps: params.liquidationPenaltyBps,
    liquidationBonusBps: params.liquidationBonusBps,
    oracleFreshnessWindowSeconds: params.oracleFreshnessWindowSeconds,
    vaultMintCapMicroStable: params.vaultMintCapMicroStable,
    protocolDebtCeilingMicroStable: params.protocolDebtCeilingMicroStable,
    minDebtFloorMicroStable: params.minDebtFloorMicroStable,
  }

  const totalDebtMicroStable = status.totalDebtMicroStable
  const vaults = []
  const maxVaultsToScan = Number(status.nextVaultId > 200n ? 200n : status.nextVaultId)

  for (let id = 1; id < maxVaultsToScan; id += 1) {
    try {
      const vault = await protocol.readVault({
        args: { vaultId: BigInt(id) },
        boxReferences: [vaultBox(protocol.appId, BigInt(id))],
      })
      vaults.push(
        enrichVault({
          id: vault.id,
          owner: vault.owner,
          collateralMicroAlgo: vault.collateralMicroAlgo,
          debtMicroStable: vault.debtMicroStable,
          createdAt: vault.createdAt,
          updatedAt: vault.updatedAt,
          version: vault.version,
          params: protocolParams,
          pricePerAlgoMicroUsd: oracleSample.pricePerAlgoMicroUsd,
          totalDebtMicroStable,
        })
      )
    } catch {
      // Sparse deterministic ids are expected once vault boxes have been closed.
    }
  }

  return buildSnapshotFromVaults({
    vaults,
    owner: snapshotOwner,
    mode: "chain",
    network: ctx.config.network,
    params: protocolParams,
    oracle: {
      updater: oracleSample.updater,
      pricePerAlgoMicroUsd: oracleSample.pricePerAlgoMicroUsd,
      updatedAt: oracleSample.updatedAt,
      updatedRound: oracleSample.updatedRound,
      source: bytesToUtf8(oracleSample.source),
      maxAgeSeconds: oracleSample.maxAgeSeconds,
      pauseFlags: oracleSample.pauseFlags,
      isFresh: oracleSample.isFresh,
    },
    stablecoin: {
      admin: stablecoinState.admin,
      initialized: stablecoinState.initialized === 1n,
      protocolManagerAppId: stablecoinState.protocolManagerAppId,
      stableAssetId: stablecoinState.stableAssetId,
      issuedSupplyMicroStable: stablecoinState.issuedSupplyMicroStable,
      supplyCeilingMicroStable: stablecoinState.supplyCeilingMicroStable,
      pauseFlags: stablecoinState.pauseFlags,
    },
  })
}

function requireWallet(ctx: RepositoryContext) {
  if (!ctx.activeAddress || !ctx.transactionSigner) {
    throw new Error("Connect a wallet before submitting transactions")
  }
  return algosdk.Address.fromString(ctx.activeAddress)
}

export async function createVaultOnChain(
  ctx: RepositoryContext,
  input: CreateVaultInput = {}
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { protocol } = getClients(ctx)
  const status = await protocol.readProtocolStatus()
  const vaultId = status.nextVaultId
  const walletAddressText = walletAddress.toString()
  const boxReferences = vaultLifecycleBoxes(protocol.appId, walletAddressText, vaultId)

  await protocol.newGroup().createVault({ sender: walletAddress, args: [], boxReferences }).simulate({
    skipSignatures: true,
  })
  const result = await protocol.send.createVault({
    sender: walletAddress,
    args: [],
    boxReferences,
  })

  if (input.initialCollateralMicroAlgo && input.initialCollateralMicroAlgo > 0n) {
    await depositCollateralOnChain(ctx, vaultId, input.initialCollateralMicroAlgo)
  }
  if (input.initialMintMicroStable && input.initialMintMicroStable > 0n) {
    await mintStablecoinOnChain(ctx, vaultId, input.initialMintMicroStable)
  }

  return {
    txId: txIdFromResult(result),
    vaultId,
    simulated: true,
    message: `Vault #${vaultId.toString().padStart(4, "0")} created`,
  }
}

export async function depositCollateralOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroAlgo: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol } = getClients(ctx)
  const payment = await algorand.createTransaction.payment({
    sender: walletAddress,
    receiver: protocol.appAddress,
    amount: microAlgo(amountMicroAlgo),
  })
  const params = {
    sender: walletAddress,
    args: { vaultId, payment },
    boxReferences: [vaultBox(protocol.appId, vaultId)],
  }

  await protocol.newGroup().depositCollateral(params).simulate({ skipSignatures: true })
  const result = await protocol.send.depositCollateral(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Collateral deposited" }
}

export async function mintStablecoinOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroStable: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { protocol, oracle, stablecoin } = getClients(ctx)
  if (!ctx.config.oracleAppId || !ctx.config.stablecoinAppId || !oracle || !stablecoin) {
    throw new Error("Oracle and stablecoin app ids are required for minting")
  }
  const stableState = await stablecoin.readStablecoinControlState()
  const walletAddressText = walletAddress.toString()
  const params = {
    sender: walletAddress,
    args: { vaultId, amountMicroStable },
    appReferences: [ctx.config.oracleAppId, ctx.config.stablecoinAppId],
    assetReferences: [stableState.stableAssetId],
    accountReferences: [walletAddressText, stablecoin.appAddress.toString()],
    boxReferences: [vaultBox(protocol.appId, vaultId)],
    extraFee: microAlgo(2_000),
  }

  await protocol.newGroup().mintStablecoin(params).simulate({ skipSignatures: true })
  const result = await protocol.send.mintStablecoin(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "algoUSD minted" }
}

export async function repayStablecoinOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroStable: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol, stablecoin } = getClients(ctx)
  if (!ctx.config.stablecoinAppId || !stablecoin) {
    throw new Error("Stablecoin app id is required for repayment")
  }
  const stableState = await stablecoin.readStablecoinControlState()
  const repayment = await algorand.createTransaction.assetTransfer({
    sender: walletAddress,
    receiver: stablecoin.appAddress,
    assetId: stableState.stableAssetId,
    amount: amountMicroStable,
  })
  const params = {
    sender: walletAddress,
    args: { vaultId, repayment },
    appReferences: [ctx.config.stablecoinAppId],
    assetReferences: [stableState.stableAssetId],
    boxReferences: [vaultBox(protocol.appId, vaultId)],
    extraFee: microAlgo(1_000),
  }

  await protocol.newGroup().repay(params).simulate({ skipSignatures: true })
  const result = await protocol.send.repay(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Debt repaid" }
}

export async function withdrawCollateralOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroAlgo: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { protocol } = getClients(ctx)
  if (!ctx.config.oracleAppId) throw new Error("Oracle app id is required for withdrawal checks")
  const walletAddressText = walletAddress.toString()
  const params = {
    sender: walletAddress,
    args: { vaultId, amountMicroAlgo },
    appReferences: [ctx.config.oracleAppId],
    accountReferences: [walletAddressText],
    boxReferences: vaultLifecycleBoxes(protocol.appId, walletAddressText, vaultId),
    extraFee: microAlgo(1_000),
  }

  await protocol.newGroup().withdrawCollateral(params).simulate({ skipSignatures: true })
  const result = await protocol.send.withdrawCollateral(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Collateral withdrawn" }
}

export async function liquidateVaultOnChain(
  ctx: RepositoryContext,
  snapshot: ProtocolSnapshot,
  vaultId: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol, stablecoin } = getClients(ctx)
  if (!ctx.config.oracleAppId || !ctx.config.stablecoinAppId || !stablecoin) {
    throw new Error("Oracle and stablecoin app ids are required for liquidation")
  }
  const vault = snapshot.vaults.find((candidate) => candidate.id === vaultId)
  if (!vault) throw new Error("Vault not found")

  const stableState = await stablecoin.readStablecoinControlState()
  const walletAddressText = walletAddress.toString()
  const repayment = await algorand.createTransaction.assetTransfer({
    sender: walletAddress,
    receiver: stablecoin.appAddress,
    assetId: stableState.stableAssetId,
    amount: vault.debtMicroStable,
  })
  const params = {
    sender: walletAddress,
    args: { repayment, vaultId },
    appReferences: [ctx.config.oracleAppId, ctx.config.stablecoinAppId],
    assetReferences: [stableState.stableAssetId],
    accountReferences: [walletAddressText, vault.owner],
    boxReferences: [vaultBox(protocol.appId, vaultId), ownerVaultBox(protocol.appId, vault.owner, vaultId)],
    extraFee: microAlgo(20_000),
  }

  await protocol.newGroup().liquidate(params).simulate({ skipSignatures: true })
  const result = await protocol.send.liquidate(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Vault liquidated" }
}

export { defaultProtocolParams }
