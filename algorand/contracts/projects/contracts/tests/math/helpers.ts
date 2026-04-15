/**
 * Shared test fixtures and factory helpers.
 */
import {
  bps,
  microAlgo,
  microStable,
  microUsd,
  seconds,
  type OraclePrice,
  type ProtocolParams,
  type VaultState,
} from "../../src/math/types"
import {
  DEFAULT_LIQUIDATION_BONUS_BPS,
  DEFAULT_LIQUIDATION_PENALTY_BPS,
  DEFAULT_LIQUIDATION_RATIO_BPS,
  DEFAULT_MIN_COLLATERAL_RATIO_BPS,
  DEFAULT_MIN_DEBT_FLOOR_MICRO_STABLE,
  DEFAULT_ORACLE_FRESHNESS_WINDOW_SECONDS,
  DEFAULT_PROTOCOL_DEBT_CEILING_MICRO_STABLE,
  DEFAULT_VAULT_MINT_CAP_MICRO_STABLE,
  MICRO_DENOMINATOR,
} from "../../src/math/constants"

export const NOW = seconds(1_700_000_000n)

/** $0.38 per ALGO */
export const PRICE_38C: OraclePrice = {
  pricePerAlgoMicroUsd: microUsd(380_000n),
  updatedAt: NOW,
}

/** $1.00 per ALGO */
export const PRICE_1USD: OraclePrice = {
  pricePerAlgoMicroUsd: microUsd(1_000_000n),
  updatedAt: NOW,
}

export const DEFAULT_PARAMS: ProtocolParams = {
  minCollateralRatioBps: DEFAULT_MIN_COLLATERAL_RATIO_BPS,
  liquidationRatioBps: DEFAULT_LIQUIDATION_RATIO_BPS,
  liquidationPenaltyBps: DEFAULT_LIQUIDATION_PENALTY_BPS,
  liquidationBonusBps: DEFAULT_LIQUIDATION_BONUS_BPS,
  oracleFreshnessWindowSeconds: DEFAULT_ORACLE_FRESHNESS_WINDOW_SECONDS,
  vaultMintCapMicroStable: DEFAULT_VAULT_MINT_CAP_MICRO_STABLE,
  protocolDebtCeilingMicroStable: DEFAULT_PROTOCOL_DEBT_CEILING_MICRO_STABLE,
  minDebtFloorMicroStable: DEFAULT_MIN_DEBT_FLOOR_MICRO_STABLE,
  mintPaused: false,
  emergencyPaused: false,
}

let vaultCounter = 0

export function makeVault(
  collateralAlgo: bigint,
  debtAlgoUsd: bigint
): VaultState {
  return {
    id: `vault-${++vaultCounter}`,
    owner: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    collateralMicroAlgo: microAlgo(collateralAlgo * MICRO_DENOMINATOR),
    debtMicroStable: microStable(debtAlgoUsd * MICRO_DENOMINATOR),
    lastUpdatedAt: NOW,
  }
}

/** Build a vault with raw micro amounts (no multiplier). */
export function makeVaultMicro(
  collateralMicroAlgo: bigint,
  debtMicroStable: bigint
): VaultState {
  return {
    id: `vault-${++vaultCounter}`,
    owner: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    collateralMicroAlgo: microAlgo(collateralMicroAlgo),
    debtMicroStable: microStable(debtMicroStable),
    lastUpdatedAt: NOW,
  }
}

export function stalePrice(): OraclePrice {
  return {
    pricePerAlgoMicroUsd: microUsd(380_000n),
    updatedAt: seconds(NOW - DEFAULT_ORACLE_FRESHNESS_WINDOW_SECONDS - 1n),
  }
}

export function params(overrides: Partial<ProtocolParams> = {}): ProtocolParams {
  return { ...DEFAULT_PARAMS, ...overrides }
}
