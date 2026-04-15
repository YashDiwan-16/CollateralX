/**
 * Liquidation eligibility and outcome calculations.
 *
 * Liquidation flow:
 *   1. Liquidator repays `repayMicroStable` of vault debt.
 *   2. Vault releases `collateralSeizedMicroAlgo` = repay_USD × (1 + bonus_bps).
 *   3. Protocol retains `penaltyMicroAlgo` = repay_USD × penalty_bps from the seized amount.
 *   4. Liquidator receives the remainder: seized − penalty.
 *
 * All intermediate values use μUsd so the USD↔ALGO conversion is explicit.
 */

import { BPS_DENOMINATOR, MICRO_DENOMINATOR } from "./constants"
import { mulDiv, mulDivUp, unwrap } from "./decimal"
import { ProtocolError } from "./errors"
import {
  err,
  microAlgo,
  microStable,
  microUsd,
  ok,
  type MicroAlgo,
  type MicroStable,
  type MicroUsd,
  type OraclePrice,
  type ProtocolParams,
  type Result,
  type Seconds,
  type VaultState,
} from "./types"
import { collateralRatioBps, validateOracle } from "./vault"

// ── Eligibility ───────────────────────────────────────────────────────────

/**
 * Returns true when the vault's collateral ratio is at or below the
 * liquidation threshold.
 */
export function isLiquidatable(
  vault: VaultState,
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<boolean, ProtocolError> {
  if (vault.debtMicroStable === 0n) return ok(false)
  if (vault.collateralMicroAlgo === 0n) return ok(true) // debt with no collateral → liquidatable

  const priceResult = validateOracle(price, nowSeconds, params)
  if (!priceResult.ok) return err(priceResult.error)

  const ratio = collateralRatioBps(vault.collateralMicroAlgo, vault.debtMicroStable, priceResult.value)
  if (ratio === null) return ok(false)

  return ok(ratio <= params.liquidationRatioBps)
}

// ── Liquidation outcome ───────────────────────────────────────────────────

export interface LiquidationOutcome {
  /** Collateral seized from the vault in total (μALGO). */
  readonly totalSeizedMicroAlgo: MicroAlgo
  /** Collateral credited to the liquidator (μALGO). */
  readonly liquidatorReceivesMicroAlgo: MicroAlgo
  /** Collateral retained by the protocol as fee (μALGO). */
  readonly protocolFeeMicroAlgo: MicroAlgo
  /** Debt erased from the vault (μStable) — equals `repayMicroStable`. */
  readonly debtReduced: MicroStable
  /** Vault state after the liquidation is applied. */
  readonly vaultAfter: VaultState
}

/**
 * Compute and apply a (partial or full) liquidation.
 *
 * Collateral math (all intermediate values in μUsd to avoid unit confusion):
 *
 *   repay_μUsd           = repay_μStable × price_μUsd / MICRO_DENOMINATOR
 *   total_seized_μUsd    = repay_μUsd × (BPS + bonus_bps) / BPS
 *   penalty_μUsd         = repay_μUsd × penalty_bps / BPS
 *   total_seized_μAlgo   = ceil(total_seized_μUsd × MICRO_DENOMINATOR / price_μUsd)
 *   penalty_μAlgo        = floor(penalty_μUsd × MICRO_DENOMINATOR / price_μUsd)
 *   liquidator_μAlgo     = total_seized − penalty
 *
 * Ceiling division for seized collateral ensures the vault is never under-charged.
 */
export function liquidationOutcome(
  vault: VaultState,
  repayMicroStable: MicroStable,
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<LiquidationOutcome, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  if (repayMicroStable === 0n) return err(ProtocolError.ZERO_LIQUIDATION_AMOUNT)
  if (vault.collateralMicroAlgo === 0n) return err(ProtocolError.NO_COLLATERAL_TO_SEIZE)

  const eligResult = isLiquidatable(vault, price, nowSeconds, params)
  if (!eligResult.ok) return err(eligResult.error)
  if (!eligResult.value) return err(ProtocolError.NOT_LIQUIDATABLE)

  if (repayMicroStable > vault.debtMicroStable) return err(ProtocolError.LIQUIDATION_EXCEEDS_DEBT)

  const priceResult = validateOracle(price, nowSeconds, params)
  if (!priceResult.ok) return err(priceResult.error)
  const priceMicroUsd = priceResult.value

  // repay_μUsd = repay_μStable × price / MICRO_DENOMINATOR
  const repayMicroUsd = microUsd(unwrap(mulDiv(repayMicroStable, priceMicroUsd, MICRO_DENOMINATOR)))

  // total_seized_μUsd = repay_μUsd × (BPS + bonus) / BPS
  const totalSeizedMicroUsd = microUsd(
    unwrap(mulDiv(repayMicroUsd, BPS_DENOMINATOR + params.liquidationBonusBps, BPS_DENOMINATOR))
  )

  // penalty_μUsd = repay_μUsd × penalty / BPS
  const penaltyMicroUsd = microUsd(
    unwrap(mulDiv(repayMicroUsd, params.liquidationPenaltyBps, BPS_DENOMINATOR))
  )

  // Convert to μAlgo using ceiling for seized, floor for penalty
  const totalSeizedMicroAlgo = microAlgo(
    unwrap(mulDivUp(totalSeizedMicroUsd, MICRO_DENOMINATOR, priceMicroUsd))
  )
  const penaltyMicroAlgo = microAlgo(
    unwrap(mulDiv(penaltyMicroUsd, MICRO_DENOMINATOR, priceMicroUsd))
  )

  // Cap seizure at actual vault collateral
  const actualSeized = microAlgo(
    totalSeizedMicroAlgo > vault.collateralMicroAlgo
      ? vault.collateralMicroAlgo
      : totalSeizedMicroAlgo
  )
  const actualPenalty = microAlgo(penaltyMicroAlgo > actualSeized ? actualSeized : penaltyMicroAlgo)
  const liquidatorReceives = microAlgo(actualSeized - actualPenalty)

  const vaultAfter: VaultState = {
    ...vault,
    collateralMicroAlgo: microAlgo(vault.collateralMicroAlgo - actualSeized),
    debtMicroStable: microStable(vault.debtMicroStable - repayMicroStable),
    lastUpdatedAt: nowSeconds,
  }

  return ok({
    totalSeizedMicroAlgo: actualSeized,
    liquidatorReceivesMicroAlgo: liquidatorReceives,
    protocolFeeMicroAlgo: actualPenalty,
    debtReduced: repayMicroStable,
    vaultAfter,
  })
}
