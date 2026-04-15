export type ProtocolNetwork = "localnet" | "testnet" | "mainnet"

export type VaultHealthState = "safe" | "warn" | "danger" | "liquidatable" | "closed"

export interface ProtocolParams {
  minCollateralRatioBps: bigint
  liquidationRatioBps: bigint
  liquidationPenaltyBps: bigint
  liquidationBonusBps: bigint
  oracleFreshnessWindowSeconds: bigint
  vaultMintCapMicroStable: bigint
  protocolDebtCeilingMicroStable: bigint
  minDebtFloorMicroStable: bigint
}

export interface ProtocolStatus {
  admin: string
  initialized: boolean
  nextVaultId: bigint
  vaultCount: bigint
  totalDebtMicroStable: bigint
  totalCollateralMicroAlgo: bigint
  protocolFeeCollateralMicroAlgo: bigint
  pauseFlags: bigint
  oracleAppId: bigint
  stablecoinAppId: bigint
  liquidationAppId: bigint
}

export interface OracleSample {
  updater: string
  pricePerAlgoMicroUsd: bigint
  updatedAt: bigint
  updatedRound: bigint
  source: string
  maxAgeSeconds: bigint
  pauseFlags: bigint
  isFresh: boolean
}

export interface StablecoinState {
  admin: string
  initialized: boolean
  protocolManagerAppId: bigint
  stableAssetId: bigint
  issuedSupplyMicroStable: bigint
  supplyCeilingMicroStable: bigint
  pauseFlags: bigint
}

export interface VaultRecord {
  id: bigint
  owner: string
  collateralMicroAlgo: bigint
  debtMicroStable: bigint
  createdAt: bigint
  updatedAt: bigint
  status: bigint
  version: bigint
}

export interface VaultEvaluation {
  vault: VaultRecord
  collateralValueMicroStable: bigint
  collateralRatioBps: bigint | null
  liquidationPriceMicroUsd: bigint | null
  health: VaultHealthState
  isLiquidatable: boolean
}

export interface ProtocolState {
  network: ProtocolNetwork
  loadedAt: number
  status: ProtocolStatus
  params: ProtocolParams
  oracle: OracleSample
  stablecoin: StablecoinState
  vaults: VaultRecord[]
}

export interface LiquidationCandidate extends VaultEvaluation {
  reason: "below-threshold" | "at-threshold"
  repayAmountMicroStable: bigint
  estimatedCollateralValueMicroStable: bigint
}

export type KeeperDecision =
  | {
      kind: "liquidate"
      candidate: LiquidationCandidate
      jobKey: string
    }
  | {
      kind: "skip"
      vault: VaultRecord
      reason: string
      evaluation?: VaultEvaluation
    }

export interface KeeperGuardrails {
  executionEnabled: boolean
  dryRun: boolean
  maxLiquidationsPerRun: number
  maxDebtMicroStablePerRun: bigint
  minLiquidationGapBps: bigint
  staleOracleBlocksExecution: boolean
  blockedVaultIds: Set<string>
  allowedVaultIds?: Set<string>
}

export interface KeeperPlan {
  scannedVaults: number
  candidates: LiquidationCandidate[]
  decisions: KeeperDecision[]
  skipped: KeeperDecision[]
}

export interface TxSubmission {
  txId: string
  simulated: boolean
}

export interface IndexedEvent {
  id: string
  type: string
  vaultId?: bigint
  owner?: string
  actor?: string
  amountMicroAlgo?: bigint
  amountMicroStable?: bigint
  round?: bigint
  timestamp: number
  txId?: string
  metadata?: Record<string, string | number | boolean | bigint | null>
}

export interface ProtocolSummaryReadModel {
  tvlMicroUsd: bigint
  totalDebtMicroStable: bigint
  totalCollateralMicroAlgo: bigint
  vaultCount: bigint
  liquidatableVaultCount: bigint
  atRiskVaultCount: bigint
  systemCollateralRatioBps: bigint | null
  oracleUpdatedRound: bigint
  loadedAt: number
}

export interface UserVaultHistory {
  owner: string
  events: IndexedEvent[]
}
