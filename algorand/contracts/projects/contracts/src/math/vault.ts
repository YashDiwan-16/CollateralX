/**
 * Vault health and state-transition functions.
 *
 * All functions are pure — they accept current state and return either a new
 * state or an error.  No side-effects, no I/O.
 *
 * Unit conventions (see types.ts for branded types):
 *  collateral : MicroAlgo
 *  debt       : MicroStable  (1 algoUSD = 1 MicroStable × 10⁻⁶)
 *  price      : MicroUsd per ALGO
 *  ratio      : Bps          (10 000 = 100 %)
 */

import { BPS_DENOMINATOR, MICRO_DENOMINATOR, STATUS_DANGER_THRESHOLD_BPS, STATUS_SAFE_THRESHOLD_BPS } from "./constants"
import { mulDiv, mulDivUp, unwrap } from "./decimal"
import { ProtocolError } from "./errors"
import {
  bps,
  err,
  microAlgo,
  microStable,
  microUsd,
  ok,
  seconds,
  type Bps,
  type MicroAlgo,
  type MicroStable,
  type MicroUsd,
  type OraclePrice,
  type ProtocolParams,
  type Result,
  type Seconds,
  type VaultHealth,
  type VaultState,
  type VaultStatus,
} from "./types"

// ── Oracle validation ─────────────────────────────────────────────────────

function validateOracle(
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<MicroUsd, ProtocolError> {
  if (price.pricePerAlgoMicroUsd <= 0n) return err(ProtocolError.INVALID_ORACLE_PRICE)
  const age = nowSeconds - price.updatedAt
  if (age > params.oracleFreshnessWindowSeconds) return err(ProtocolError.STALE_ORACLE)
  return ok(price.pricePerAlgoMicroUsd)
}

// ── Collateral value ──────────────────────────────────────────────────────

/**
 * USD value of vault collateral in μUsd.
 *
 * collateral_μUsd = collateral_μAlgo × price_μUsd_per_ALGO / MICRO_DENOMINATOR
 *
 * Dividing by MICRO_DENOMINATOR converts from (μAlgo × μUsd/ALGO) → μUsd.
 */
export function collateralValueMicroUsd(
  collateralMicroAlgo: MicroAlgo,
  pricePerAlgoMicroUsd: MicroUsd
): MicroUsd {
  return microUsd(unwrap(mulDiv(collateralMicroAlgo, pricePerAlgoMicroUsd, MICRO_DENOMINATOR)))
}

// ── Collateral ratio ──────────────────────────────────────────────────────

/**
 * Collateral ratio in basis points, or null when debt is zero.
 *
 * ratio_bps = (collateral_μUsd / debt_μStable) × BPS_DENOMINATOR
 *
 * Both collateral_μUsd and debt_μStable use the same μ-scale so no unit
 * conversion is required before dividing.
 */
export function collateralRatioBps(
  collateralMicroAlgo: MicroAlgo,
  debtMicroStable: MicroStable,
  pricePerAlgoMicroUsd: MicroUsd
): Bps | null {
  if (debtMicroStable === 0n) return null
  const collUsd = collateralValueMicroUsd(collateralMicroAlgo, pricePerAlgoMicroUsd)
  return bps(unwrap(mulDiv(collUsd, BPS_DENOMINATOR, debtMicroStable)))
}

// ── Vault health ──────────────────────────────────────────────────────────

function statusFromRatio(ratioBps: Bps): VaultStatus {
  if (ratioBps >= STATUS_SAFE_THRESHOLD_BPS) return "safe"
  if (ratioBps >= STATUS_DANGER_THRESHOLD_BPS) return "warn"
  return "danger"
}

/**
 * ALGO price at which the vault's collateral ratio hits exactly the
 * liquidation threshold.
 *
 * liquidation_price_μUsd = (debt_μStable × liquidation_ratio_bps × MICRO_DENOMINATOR)
 *                          / (collateral_μAlgo × BPS_DENOMINATOR)
 */
export function liquidationPriceMicroUsd(
  collateralMicroAlgo: MicroAlgo,
  debtMicroStable: MicroStable,
  liquidationRatioBps: Bps
): MicroUsd | null {
  if (debtMicroStable === 0n || collateralMicroAlgo === 0n) return null
  const num = debtMicroStable * liquidationRatioBps * MICRO_DENOMINATOR
  const den = collateralMicroAlgo * BPS_DENOMINATOR
  return microUsd(num / den)
}

/** Full health snapshot for a vault. */
export function vaultHealth(
  vault: VaultState,
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<VaultHealth, ProtocolError> {
  const priceResult = validateOracle(price, nowSeconds, params)
  if (!priceResult.ok) return err(priceResult.error)

  if (vault.collateralMicroAlgo === 0n && vault.debtMicroStable === 0n) {
    return ok({ collateralRatioBps: null, status: "empty", liquidationPriceMicroUsd: null })
  }

  const ratioBps = collateralRatioBps(vault.collateralMicroAlgo, vault.debtMicroStable, priceResult.value)
  const liqPrice = liquidationPriceMicroUsd(
    vault.collateralMicroAlgo,
    vault.debtMicroStable,
    params.liquidationRatioBps
  )

  const status: VaultStatus = ratioBps === null ? "safe" : statusFromRatio(ratioBps)

  return ok({ collateralRatioBps: ratioBps, status, liquidationPriceMicroUsd: liqPrice })
}

/** True when vault is at or above the minimum collateral ratio. */
export function isHealthy(
  collateralMicroAlgo: MicroAlgo,
  debtMicroStable: MicroStable,
  pricePerAlgoMicroUsd: MicroUsd,
  minCollateralRatioBps: Bps
): boolean {
  if (debtMicroStable === 0n) return true
  const ratio = collateralRatioBps(collateralMicroAlgo, debtMicroStable, pricePerAlgoMicroUsd)
  return ratio !== null && ratio >= minCollateralRatioBps
}

// ── Minimum collateral required ───────────────────────────────────────────

/**
 * Minimum μAlgo needed to carry `debtMicroStable` at `minCollateralRatioBps`.
 * Uses ceiling division so the result is always ≥ the safe boundary.
 *
 * min_collateral_μAlgo = ceil(debt_μStable × ratio_bps × MICRO_DENOMINATOR
 *                             / (price_μUsd × BPS_DENOMINATOR))
 */
export function minCollateralForDebt(
  debtMicroStable: MicroStable,
  pricePerAlgoMicroUsd: MicroUsd,
  minCollateralRatioBps: Bps
): MicroAlgo {
  if (debtMicroStable === 0n) return microAlgo(0n)
  const num = debtMicroStable * minCollateralRatioBps * MICRO_DENOMINATOR
  const den = pricePerAlgoMicroUsd * BPS_DENOMINATOR
  return microAlgo(unwrap(mulDivUp(1n, num, den)))
}

// ── State transitions ─────────────────────────────────────────────────────

/** Add collateral — always allowed unless emergency pause. */
export function applyDeposit(
  vault: VaultState,
  amountMicroAlgo: MicroAlgo,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<VaultState, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  return ok({
    ...vault,
    collateralMicroAlgo: microAlgo(vault.collateralMicroAlgo + amountMicroAlgo),
    lastUpdatedAt: nowSeconds,
  })
}

/** Withdraw collateral — rejected if it would undercollateralise the vault. */
export function applyWithdraw(
  vault: VaultState,
  amountMicroAlgo: MicroAlgo,
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<VaultState, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  if (amountMicroAlgo === 0n) return err(ProtocolError.ZERO_WITHDRAW_AMOUNT)

  const priceResult = validateOracle(price, nowSeconds, params)
  if (!priceResult.ok) return err(priceResult.error)

  if (amountMicroAlgo > vault.collateralMicroAlgo) return err(ProtocolError.INSUFFICIENT_COLLATERAL)

  const newCollateral = microAlgo(vault.collateralMicroAlgo - amountMicroAlgo)

  if (
    !isHealthy(newCollateral, vault.debtMicroStable, priceResult.value, params.minCollateralRatioBps)
  ) {
    return err(ProtocolError.UNDERCOLLATERALISED)
  }

  return ok({ ...vault, collateralMicroAlgo: newCollateral, lastUpdatedAt: nowSeconds })
}

/** Mint algoUSD — validated against per-vault cap and protocol ceiling. */
export function applyMint(
  vault: VaultState,
  amountMicroStable: MicroStable,
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams,
  protocolTotalDebt: MicroStable
): Result<VaultState, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  if (params.mintPaused) return err(ProtocolError.MINT_PAUSED)
  if (amountMicroStable === 0n) return err(ProtocolError.ZERO_MINT_AMOUNT)

  const priceResult = validateOracle(price, nowSeconds, params)
  if (!priceResult.ok) return err(priceResult.error)

  const newDebt = microStable(vault.debtMicroStable + amountMicroStable)

  // Per-vault cap
  if (newDebt > params.vaultMintCapMicroStable) return err(ProtocolError.VAULT_MINT_CAP_EXCEEDED)

  // Protocol ceiling
  const newTotalDebt = microStable(protocolTotalDebt + amountMicroStable)
  if (newTotalDebt > params.protocolDebtCeilingMicroStable) {
    return err(ProtocolError.PROTOCOL_DEBT_CEILING_EXCEEDED)
  }

  // Collateral ratio check
  if (!isHealthy(vault.collateralMicroAlgo, newDebt, priceResult.value, params.minCollateralRatioBps)) {
    return err(ProtocolError.MINT_UNDERCOLLATERALISED)
  }

  return ok({ ...vault, debtMicroStable: newDebt, lastUpdatedAt: nowSeconds })
}

/** Repay algoUSD debt. */
export function applyRepay(
  vault: VaultState,
  amountMicroStable: MicroStable,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<VaultState, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  if (amountMicroStable === 0n) return err(ProtocolError.ZERO_REPAY_AMOUNT)
  if (amountMicroStable > vault.debtMicroStable) return err(ProtocolError.REPAY_EXCEEDS_DEBT)

  const newDebt = microStable(vault.debtMicroStable - amountMicroStable)

  // After a partial repay the remaining debt must clear the floor (or be zero)
  if (newDebt > 0n && newDebt < params.minDebtFloorMicroStable) {
    return err(ProtocolError.BELOW_DEBT_FLOOR)
  }

  return ok({ ...vault, debtMicroStable: newDebt, lastUpdatedAt: nowSeconds })
}

/** Close vault — requires debt to already be zero. */
export function applyClose(
  vault: VaultState,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<VaultState, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  if (vault.debtMicroStable !== 0n) return err(ProtocolError.DEBT_NOT_ZERO)
  return ok({
    ...vault,
    collateralMicroAlgo: microAlgo(0n),
    debtMicroStable: microStable(0n),
    lastUpdatedAt: nowSeconds,
  })
}

// ── Re-export helpers used by sibling modules ─────────────────────────────
export { validateOracle, seconds }
