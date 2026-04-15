import type { EventItem } from "@/components/shared/event-log"

export type DataMode = "mock" | "chain"

export type ProtocolNetwork = "localnet" | "testnet" | "mainnet"

export type HealthState = "safe" | "warn" | "danger" | "liquidatable" | "closed"

export type ProtocolAction =
  | "createVault"
  | "deposit"
  | "mint"
  | "repay"
  | "withdraw"
  | "liquidate"

export interface ProtocolConfig {
  dataMode: DataMode
  network: ProtocolNetwork
  algodServer: string
  algodToken: string
  algodPort?: string
  indexerServer: string
  indexerToken: string
  indexerPort?: string
  protocolAppId?: bigint
  oracleAppId?: bigint
  stablecoinAppId?: bigint
  liquidationAppId?: bigint
  keeperAddress?: string
}

export interface ProtocolParamsView {
  minCollateralRatioBps: bigint
  liquidationRatioBps: bigint
  liquidationPenaltyBps: bigint
  liquidationBonusBps: bigint
  oracleFreshnessWindowSeconds: bigint
  vaultMintCapMicroStable: bigint
  protocolDebtCeilingMicroStable: bigint
  minDebtFloorMicroStable: bigint
}

export interface ProtocolStatusView {
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

export interface OracleStateView {
  updater: string
  pricePerAlgoMicroUsd: bigint
  updatedAt: bigint
  updatedRound: bigint
  source: string
  maxAgeSeconds: bigint
  pauseFlags: bigint
  isFresh: boolean
}

export interface StablecoinStateView {
  admin: string
  initialized: boolean
  protocolManagerAppId: bigint
  stableAssetId: bigint
  issuedSupplyMicroStable: bigint
  supplyCeilingMicroStable: bigint
  pauseFlags: bigint
}

export interface KeeperStateView {
  address?: string
  status: "active" | "unknown" | "paused"
  lastRunLabel: string
  scannedVaults: bigint
  liquidations24h: bigint
}

export interface VaultView {
  id: bigint
  displayId: string
  owner: string
  collateralMicroAlgo: bigint
  debtMicroStable: bigint
  collateralValueMicroStable: bigint
  collateralRatioBps: bigint | null
  liquidationPriceMicroUsd: bigint | null
  maxMintableMicroStable: bigint
  maxWithdrawableMicroAlgo: bigint
  health: HealthState
  isLiquidatable: boolean
  createdAt: bigint
  updatedAt: bigint
  version: bigint
}

export interface ProtocolDashboardView {
  tvlMicroUsd: bigint
  totalMintedMicroStable: bigint
  vaultCount: bigint
  systemCollateralRatioBps: bigint | null
  liquidatableVaultCount: bigint
  atRiskVaultCount: bigint
  liquidatableDebtMicroStable: bigint
  estimatedLiquidatorRewardMicroStable: bigint
}

export interface ProtocolSnapshot {
  mode: DataMode
  network: ProtocolNetwork
  loadedAt: number
  status: ProtocolStatusView
  params: ProtocolParamsView
  oracle: OracleStateView
  stablecoin: StablecoinStateView
  keeper: KeeperStateView
  vaults: VaultView[]
  userVaults: VaultView[]
  liquidationQueue: VaultView[]
  dashboard: ProtocolDashboardView
  priceHistory: number[]
  events: EventItem[]
  warnings: string[]
}

export interface ProtocolActionResult {
  txId: string
  vaultId?: bigint
  simulated: boolean
  message: string
}

export interface CreateVaultInput {
  initialCollateralMicroAlgo?: bigint
  initialMintMicroStable?: bigint
}

export interface ProtocolActions {
  createVault(input?: CreateVaultInput): Promise<ProtocolActionResult>
  depositCollateral(vaultId: bigint, amountMicroAlgo: bigint): Promise<ProtocolActionResult>
  mintStablecoin(vaultId: bigint, amountMicroStable: bigint): Promise<ProtocolActionResult>
  repayStablecoin(vaultId: bigint, amountMicroStable: bigint): Promise<ProtocolActionResult>
  withdrawCollateral(vaultId: bigint, amountMicroAlgo: bigint): Promise<ProtocolActionResult>
  liquidateVault(vaultId: bigint): Promise<ProtocolActionResult>
}
