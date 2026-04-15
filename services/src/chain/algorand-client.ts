import algosdk from "algosdk"
import { AlgorandClient, microAlgo } from "@algorandfoundation/algokit-utils"
import type { ChainConfig } from "../config"
import type { ChainReader, LiquidationExecutor, OracleUpdateInput, OracleUpdater } from "../ports"
import type { ProtocolState, VaultRecord, LiquidationCandidate, TxSubmission, IndexedEvent } from "../domain/types"
import { ownerVaultBox, vaultBox } from "./boxes"
import { decodeKnownEventLog } from "./events"
import { CollateralXProtocolManagerFactory } from "../../../algorand/contracts/projects/contracts/smart_contracts/artifacts/collateralx_protocol/CollateralXProtocolManagerClient"
import { CollateralXOracleAdapterFactory } from "../../../algorand/contracts/projects/contracts/smart_contracts/artifacts/collateralx_oracle/CollateralXOracleAdapterClient"
import { CollateralXStablecoinControllerFactory } from "../../../algorand/contracts/projects/contracts/smart_contracts/artifacts/collateralx_stablecoin/CollateralXStablecoinControllerClient"

const ZERO_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"

function bytesToUtf8(value: Uint8Array | string) {
  if (typeof value === "string") return value
  return new TextDecoder().decode(value)
}

function signerFromMnemonic(mnemonic?: string) {
  if (!mnemonic) return undefined
  const account = algosdk.mnemonicToSecretKey(mnemonic)
  return {
    address: account.addr.toString(),
    signer: algosdk.makeBasicAccountTransactionSigner(account),
  }
}

function txIdFromResult(result: unknown) {
  const shaped = result as {
    txIds?: string[]
    transaction?: { txID?: () => string }
    transactions?: Array<{ txID?: () => string }>
  }
  return shaped.txIds?.[0] ?? shaped.transaction?.txID?.() ?? shaped.transactions?.[0]?.txID?.() ?? "submitted"
}

export class AlgorandProtocolClient implements ChainReader, LiquidationExecutor, OracleUpdater {
  private readonly algorand: AlgorandClient
  private readonly keeperSigner?: ReturnType<typeof signerFromMnemonic>
  private readonly oracleSigner?: ReturnType<typeof signerFromMnemonic>

  constructor(private readonly config: ChainConfig) {
    this.algorand = AlgorandClient.fromClients({
      algod: new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort),
      indexer: new algosdk.Indexer(config.indexerToken, config.indexerServer, config.indexerPort),
    })
    this.keeperSigner = signerFromMnemonic(config.keeperMnemonic)
    this.oracleSigner = signerFromMnemonic(config.oracleUpdaterMnemonic)

    if (this.keeperSigner) this.algorand.setSigner(this.keeperSigner.address, this.keeperSigner.signer)
    if (this.oracleSigner) this.algorand.setSigner(this.oracleSigner.address, this.oracleSigner.signer)
  }

  async loadProtocolState(): Promise<ProtocolState> {
    const { protocol, oracle, stablecoin } = this.getClients()
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

    const vaults: VaultRecord[] = []
    const maxVaultId = status.nextVaultId > BigInt(this.config.scanLimit + 1)
      ? BigInt(this.config.scanLimit + 1)
      : status.nextVaultId

    for (let id = 1n; id < maxVaultId; id += 1n) {
      try {
        const vault = await protocol.readVault({
          args: { vaultId: id },
          boxReferences: [vaultBox(protocol.appId, id)],
        })
        vaults.push({
          id: vault.id,
          owner: vault.owner,
          collateralMicroAlgo: vault.collateralMicroAlgo,
          debtMicroStable: vault.debtMicroStable,
          createdAt: vault.createdAt,
          updatedAt: vault.updatedAt,
          status: vault.status,
          version: vault.version,
        })
      } catch {
        // Closed vault boxes are intentionally absent; sparse ids are normal.
      }
    }

    return {
      network: this.config.network,
      loadedAt: Date.now(),
      status: {
        admin: status.admin,
        initialized: status.initialized === 1n,
        nextVaultId: status.nextVaultId,
        vaultCount: status.vaultCount,
        totalDebtMicroStable: status.totalDebtMicroStable,
        totalCollateralMicroAlgo: status.totalCollateralMicroAlgo,
        protocolFeeCollateralMicroAlgo: status.protocolFeeCollateralMicroAlgo,
        pauseFlags: status.pauseFlags,
        oracleAppId: status.oracleAppId,
        stablecoinAppId: status.stablecoinAppId,
        liquidationAppId: status.liquidationAppId,
      },
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
      vaults,
    }
  }

  async getCurrentRound() {
    const status = await this.algorand.client.algod.status().do()
    return BigInt(status.lastRound)
  }

  async loadIndexedEvents(): Promise<IndexedEvent[]> {
    const appIds = [this.config.protocolAppId, this.config.oracleAppId].filter((id): id is bigint => id !== undefined)
    const results = await Promise.all(appIds.map((appId) => this.loadApplicationEvents(appId)))
    return results.flat().sort((left, right) => right.timestamp - left.timestamp)
  }

  async submitLiquidation(candidate: LiquidationCandidate): Promise<TxSubmission> {
    const sender = this.keeperSigner?.address ?? this.config.keeperAccountAddress
    if (!sender) throw new Error("Keeper account is not configured")
    const { protocol, stablecoin } = this.getClients(sender)
    if (!this.config.oracleAppId || !this.config.stablecoinAppId) {
      throw new Error("Oracle and stablecoin app ids are required for liquidation")
    }
    const stableState = await stablecoin.readStablecoinControlState()
    const repayment = await this.algorand.createTransaction.assetTransfer({
      sender,
      receiver: stablecoin.appAddress,
      assetId: stableState.stableAssetId,
      amount: candidate.repayAmountMicroStable,
    })
    const params = {
      sender,
      args: { repayment, vaultId: candidate.vault.id },
      appReferences: [this.config.oracleAppId, this.config.stablecoinAppId],
      assetReferences: [stableState.stableAssetId],
      accountReferences: [sender, candidate.vault.owner],
      boxReferences: [
        vaultBox(protocol.appId, candidate.vault.id),
        ownerVaultBox(protocol.appId, candidate.vault.owner, candidate.vault.id),
      ],
      extraFee: microAlgo(this.config.liquidationExtraFeeMicroAlgo),
    }

    if (this.config.simulateBeforeSubmit) {
      await protocol.newGroup().liquidate(params).simulate({ skipSignatures: true })
    }
    const result = await protocol.send.liquidate(params)
    return { txId: txIdFromResult(result), simulated: this.config.simulateBeforeSubmit }
  }

  async submitOracleUpdate(input: OracleUpdateInput): Promise<TxSubmission> {
    const sender = this.oracleSigner?.address ?? this.config.oracleUpdaterAddress
    if (!sender) throw new Error("Oracle updater account is not configured")
    const { oracle } = this.getClients(sender)
    const params = {
      sender,
      args: {
        pricePerAlgoMicroUsd: input.pricePerAlgoMicroUsd,
        updatedAt: input.updatedAt,
        updatedRound: input.updatedRound,
        source: new TextEncoder().encode(input.source),
      },
    }

    if (this.config.simulateBeforeSubmit) {
      await oracle.newGroup().updatePrice(params).simulate({ skipSignatures: true })
    }
    const result = await oracle.send.updatePrice(params)
    return { txId: txIdFromResult(result), simulated: this.config.simulateBeforeSubmit }
  }

  private getClients(defaultSender?: string) {
    if (!this.config.protocolAppId || !this.config.oracleAppId || !this.config.stablecoinAppId) {
      throw new Error("Protocol, oracle, and stablecoin app ids are required")
    }
    const sender = defaultSender ?? this.config.keeperAccountAddress ?? this.config.oracleUpdaterAddress ?? ZERO_ADDRESS

    const protocol = new CollateralXProtocolManagerFactory({ algorand: this.algorand, defaultSender: sender }).getAppClientById({
      appId: this.config.protocolAppId,
      defaultSender: sender,
    })
    const oracle = new CollateralXOracleAdapterFactory({ algorand: this.algorand, defaultSender: sender }).getAppClientById({
      appId: this.config.oracleAppId,
      defaultSender: sender,
    })
    const stablecoin = new CollateralXStablecoinControllerFactory({ algorand: this.algorand, defaultSender: sender }).getAppClientById({
      appId: this.config.stablecoinAppId,
      defaultSender: sender,
    })

    return { protocol, oracle, stablecoin }
  }

  private async loadApplicationEvents(appId: bigint): Promise<IndexedEvent[]> {
    const response = await this.algorand.client.indexer
      .searchForTransactions()
      .applicationID(Number(appId))
      .txType("appl")
      .limit(100)
      .do() as {
        transactions?: Array<{
          id?: string
          logs?: string[]
          confirmedRound?: number | bigint
          roundTime?: number
          "confirmed-round"?: number
          "round-time"?: number
        }>
      }

    const events: IndexedEvent[] = []
    for (const transaction of response.transactions ?? []) {
      const txId = transaction.id ?? "unknown"
      const round = transaction.confirmedRound ?? transaction["confirmed-round"]
      const timestampSeconds = transaction.roundTime ?? transaction["round-time"]
      const timestamp = timestampSeconds ? Number(timestampSeconds) * 1000 : Date.now()
      for (const [logIndex, log] of (transaction.logs ?? []).entries()) {
        const event = decodeKnownEventLog(log, {
          txId,
          logIndex,
          timestamp,
          round: round === undefined ? undefined : BigInt(round),
        })
        if (event) events.push(event)
      }
    }
    return events
  }
}
