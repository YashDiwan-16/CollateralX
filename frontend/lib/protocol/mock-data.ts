import { DEMO_OWNER_ADDRESS, MICRO_ALGO, MICRO_STABLE } from "@/lib/protocol/constants"
import {
  collateralValueMicroStable,
  enrichVault,
  liquidationRewardMicroStable,
} from "@/lib/protocol/math"
import type {
  KeeperStateView,
  OracleStateView,
  ProtocolDashboardView,
  ProtocolParamsView,
  ProtocolSnapshot,
  ProtocolStatusView,
  StablecoinStateView,
  VaultView,
} from "@/lib/protocol/types"

export const MOCK_PRICE_MICRO_USD = 381_200n

export function defaultProtocolParams(): ProtocolParamsView {
  return {
    minCollateralRatioBps: 15_000n,
    liquidationRatioBps: 15_000n,
    liquidationPenaltyBps: 1_300n,
    liquidationBonusBps: 1_300n,
    oracleFreshnessWindowSeconds: 300n,
    vaultMintCapMicroStable: 50_000n * MICRO_STABLE,
    protocolDebtCeilingMicroStable: 5_000_000n * MICRO_STABLE,
    minDebtFloorMicroStable: 10n * MICRO_STABLE,
  }
}

export function defaultOracle(nowSeconds = BigInt(Math.floor(Date.now() / 1000))): OracleStateView {
  return {
    updater: "ORACLEUPDATERDEMO000000000000000000000000000000000000M6HXUQ",
    pricePerAlgoMicroUsd: MOCK_PRICE_MICRO_USD,
    updatedAt: nowSeconds - 42n,
    updatedRound: 42_881_204n,
    source: "trusted-updater:v1",
    maxAgeSeconds: 300n,
    pauseFlags: 0n,
    isFresh: true,
  }
}

export function defaultStablecoin(): StablecoinStateView {
  return {
    admin: DEMO_OWNER_ADDRESS,
    initialized: true,
    protocolManagerAppId: 1_001n,
    stableAssetId: 1_337n,
    issuedSupplyMicroStable: 1_800_000n * MICRO_STABLE,
    supplyCeilingMicroStable: 10_000_000n * MICRO_STABLE,
    pauseFlags: 0n,
  }
}

export function defaultKeeper(vaultCount: bigint): KeeperStateView {
  return {
    address: "KEEPERBOTDEMO0000000000000000000000000000000000000013IU",
    status: "active",
    lastRunLabel: "38s ago",
    scannedVaults: vaultCount,
    liquidations24h: 7n,
  }
}

export function buildVaults(
  owner = DEMO_OWNER_ADDRESS,
  params = defaultProtocolParams(),
  oracle = defaultOracle()
) {
  const now = BigInt(Math.floor(Date.now() / 1000))
  const raw = [
    {
      id: 211n,
      owner,
      collateralMicroAlgo: 5_000n * MICRO_ALGO,
      debtMicroStable: 800n * MICRO_STABLE,
      createdAt: now - 86_400n * 5n,
      updatedAt: now - 2_400n,
      version: 1n,
    },
    {
      id: 212n,
      owner,
      collateralMicroAlgo: 3_500n * MICRO_ALGO,
      debtMicroStable: 400n * MICRO_STABLE,
      createdAt: now - 86_400n * 2n,
      updatedAt: now - 1_200n,
      version: 1n,
    },
    {
      id: 41n,
      owner: "VAULTOWNERDEMO000000000000000000000000000000000000X4SXU",
      collateralMicroAlgo: 3_100n * MICRO_ALGO,
      debtMicroStable: 850n * MICRO_STABLE,
      createdAt: now - 86_400n * 18n,
      updatedAt: now - 650n,
      version: 1n,
    },
    {
      id: 55n,
      owner: "VAULTOWNERDEMO000000000000000000000000000000000000X4SXU",
      collateralMicroAlgo: 2_800n * MICRO_ALGO,
      debtMicroStable: 700n * MICRO_STABLE,
      createdAt: now - 86_400n * 11n,
      updatedAt: now - 900n,
      version: 1n,
    },
    {
      id: 112n,
      owner: "VAULTOWNERDEMO000000000000000000000000000000000000X4SXU",
      collateralMicroAlgo: 4_200n * MICRO_ALGO,
      debtMicroStable: 900n * MICRO_STABLE,
      createdAt: now - 86_400n * 8n,
      updatedAt: now - 2_100n,
      version: 1n,
    },
  ]

  const totalDebt = raw.reduce((sum, vault) => sum + vault.debtMicroStable, 0n)

  return raw.map((vault) =>
    enrichVault({
      ...vault,
      params,
      pricePerAlgoMicroUsd: oracle.pricePerAlgoMicroUsd,
      totalDebtMicroStable: totalDebt,
    })
  )
}

export function buildSnapshotFromVaults(args: {
  vaults: VaultView[]
  owner: string
  mode?: "mock" | "chain"
  network?: "localnet" | "testnet" | "mainnet"
  params?: ProtocolParamsView
  oracle?: OracleStateView
  stablecoin?: StablecoinStateView
  warnings?: string[]
}) {
  const params = args.params ?? defaultProtocolParams()
  const oracle = args.oracle ?? defaultOracle()
  const stablecoin = args.stablecoin ?? defaultStablecoin()
  const totalDebtMicroStable = args.vaults.reduce((sum, vault) => sum + vault.debtMicroStable, 0n)
  const totalCollateralMicroAlgo = args.vaults.reduce((sum, vault) => sum + vault.collateralMicroAlgo, 0n)
  const tvlMicroUsd = collateralValueMicroStable(totalCollateralMicroAlgo, oracle.pricePerAlgoMicroUsd)
  const liquidationQueue = args.vaults
    .filter((vault) => vault.health === "liquidatable" || vault.health === "warn")
    .sort((left, right) => Number((left.collateralRatioBps ?? 99_999_999n) - (right.collateralRatioBps ?? 99_999_999n)))
  const liquidatable = args.vaults.filter((vault) => vault.isLiquidatable)

  const status: ProtocolStatusView = {
    admin: DEMO_OWNER_ADDRESS,
    initialized: true,
    nextVaultId: args.vaults.reduce((max, vault) => (vault.id > max ? vault.id : max), 0n) + 1n,
    vaultCount: BigInt(args.vaults.length),
    totalDebtMicroStable,
    totalCollateralMicroAlgo,
    protocolFeeCollateralMicroAlgo: 0n,
    pauseFlags: 0n,
    oracleAppId: 1_002n,
    stablecoinAppId: 1_003n,
    liquidationAppId: 1_004n,
  }

  const dashboard: ProtocolDashboardView = {
    tvlMicroUsd,
    totalMintedMicroStable: totalDebtMicroStable,
    vaultCount: status.vaultCount,
    systemCollateralRatioBps:
      totalDebtMicroStable === 0n ? null : (tvlMicroUsd * 10_000n) / totalDebtMicroStable,
    liquidatableVaultCount: BigInt(liquidatable.length),
    atRiskVaultCount: BigInt(liquidationQueue.length - liquidatable.length),
    liquidatableDebtMicroStable: liquidatable.reduce((sum, vault) => sum + vault.debtMicroStable, 0n),
    estimatedLiquidatorRewardMicroStable: liquidatable.reduce(
      (sum, vault) => sum + liquidationRewardMicroStable(vault, params.liquidationBonusBps),
      0n
    ),
  }

  const userVaults = args.vaults.filter((vault) => vault.owner === args.owner)

  return {
    mode: args.mode ?? "mock",
    network: args.network ?? "localnet",
    loadedAt: Date.now(),
    status,
    params,
    oracle,
    stablecoin,
    keeper: defaultKeeper(status.vaultCount),
    vaults: args.vaults,
    userVaults,
    liquidationQueue,
    dashboard,
    priceHistory: [45, 52, 48, 55, 62, 58, 65, 70, 64, 69, 73, 71],
    events: [
      { color: "green", time: "5m", text: "Vault #0212 minted 400 algoUSD" },
      { color: "green", time: "12m", text: "Vault #0211 deposited 1,000 ALGO" },
      { color: "amber", time: "22m", text: "Oracle price update: $0.3812" },
      { color: "green", time: "35m", text: "Vault #0211 repaid 200 algoUSD" },
      { color: "red", time: "41m", text: "Vault #0041 entered liquidation range" },
    ],
    warnings: args.warnings ?? [],
  } satisfies ProtocolSnapshot
}

export function createMockSnapshot(owner = DEMO_OWNER_ADDRESS) {
  const params = defaultProtocolParams()
  const oracle = defaultOracle()
  const vaults = buildVaults(owner, params, oracle)
  return buildSnapshotFromVaults({ vaults, owner, params, oracle })
}
