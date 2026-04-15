import type { IndexedEvent, ProtocolState, VaultRecord } from "../src/domain/types"

export const OWNER = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
export const LIQUIDATOR = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBREUSE"

export function vault(overrides: Partial<VaultRecord> = {}): VaultRecord {
  return {
    id: 1n,
    owner: OWNER,
    collateralMicroAlgo: 1_000n * 1_000_000n,
    debtMicroStable: 100n * 1_000_000n,
    createdAt: 1_700_000_000n,
    updatedAt: 1_700_000_100n,
    status: 1n,
    version: 1n,
    ...overrides,
  }
}

export function protocolState(overrides: Partial<ProtocolState> = {}): ProtocolState {
  const vaults = overrides.vaults ?? [
    vault({ id: 1n, collateralMicroAlgo: 1_000n * 1_000_000n, debtMicroStable: 800n * 1_000_000n }),
    vault({ id: 2n, collateralMicroAlgo: 1_000n * 1_000_000n, debtMicroStable: 300n * 1_000_000n }),
  ]
  const totalDebt = vaults.reduce((sum, item) => sum + item.debtMicroStable, 0n)
  const totalCollateral = vaults.reduce((sum, item) => sum + item.collateralMicroAlgo, 0n)

  return {
    network: "localnet",
    loadedAt: 1_700_000_200_000,
    status: {
      admin: OWNER,
      initialized: true,
      nextVaultId: 3n,
      vaultCount: BigInt(vaults.length),
      totalDebtMicroStable: totalDebt,
      totalCollateralMicroAlgo: totalCollateral,
      protocolFeeCollateralMicroAlgo: 0n,
      pauseFlags: 0n,
      oracleAppId: 2n,
      stablecoinAppId: 3n,
      liquidationAppId: 4n,
    },
    params: {
      minCollateralRatioBps: 15_000n,
      liquidationRatioBps: 15_000n,
      liquidationPenaltyBps: 1_300n,
      liquidationBonusBps: 1_300n,
      oracleFreshnessWindowSeconds: 300n,
      vaultMintCapMicroStable: 50_000n * 1_000_000n,
      protocolDebtCeilingMicroStable: 5_000_000n * 1_000_000n,
      minDebtFloorMicroStable: 10n * 1_000_000n,
    },
    oracle: {
      updater: OWNER,
      pricePerAlgoMicroUsd: 1_000_000n,
      updatedAt: 1_700_000_150n,
      updatedRound: 99n,
      source: "test",
      maxAgeSeconds: 300n,
      pauseFlags: 0n,
      isFresh: true,
    },
    stablecoin: {
      admin: OWNER,
      initialized: true,
      protocolManagerAppId: 1n,
      stableAssetId: 42n,
      issuedSupplyMicroStable: totalDebt,
      supplyCeilingMicroStable: 10_000_000n * 1_000_000n,
      pauseFlags: 0n,
    },
    vaults,
    ...overrides,
  }
}

export function protocolEvents(): IndexedEvent[] {
  return [
    {
      id: "liq-1",
      type: "liquidation",
      vaultId: 1n,
      owner: OWNER,
      actor: LIQUIDATOR,
      amountMicroStable: 800n * 1_000_000n,
      timestamp: 1_700_000_180_000,
      txId: "TX-LIQ",
    },
  ]
}
