/**
 * Minting / burn accounting helpers.
 *
 * Separated from vault.ts so callers can compute "how much can I mint?" without
 * needing a full VaultState round-trip.
 */

import { BPS_DENOMINATOR, MICRO_DENOMINATOR } from "./constants"
import { mulDiv, unwrap } from "./decimal"
import { ProtocolError } from "./errors"
import {
  err,
  microStable,
  ok,
  type Bps,
  type MicroAlgo,
  type MicroStable,
  type MicroUsd,
  type OraclePrice,
  type ProtocolParams,
  type Result,
  type Seconds,
  type VaultState,
} from "./types"
import { collateralValueMicroUsd, validateOracle } from "./vault"

// ── Max mintable ──────────────────────────────────────────────────────────

/**
 * Maximum additional algoUSD a vault can safely mint given current collateral
 * and existing debt.
 *
 * max_mintable = floor(collateral_μUsd × BPS / min_ratio_bps) − existing_debt
 *
 * Returns 0n when the vault is already at or above safe capacity.
 */
export function maxMintable(
  collateralMicroAlgo: MicroAlgo,
  existingDebtMicroStable: MicroStable,
  pricePerAlgoMicroUsd: MicroUsd,
  minCollateralRatioBps: Bps
): MicroStable {
  const collUsd = collateralValueMicroUsd(collateralMicroAlgo, pricePerAlgoMicroUsd)
  // max_debt = floor(collateral_μUsd × BPS_DENOMINATOR / min_ratio_bps)
  const maxDebt = microStable(unwrap(mulDiv(collUsd, BPS_DENOMINATOR, minCollateralRatioBps)))
  if (maxDebt <= existingDebtMicroStable) return microStable(0n)
  return microStable(maxDebt - existingDebtMicroStable)
}

// ── Validation helpers ────────────────────────────────────────────────────

/**
 * Validate a mint request against all protocol constraints.
 * Does NOT mutate state — returns an error or Ok(newDebt).
 */
export function validateMint(
  vault: VaultState,
  amountMicroStable: MicroStable,
  price: OraclePrice,
  nowSeconds: Seconds,
  params: ProtocolParams
): Result<MicroStable, ProtocolError> {
  if (params.emergencyPaused) return err(ProtocolError.EMERGENCY_PAUSED)
  if (params.mintPaused) return err(ProtocolError.MINT_PAUSED)
  if (amountMicroStable === 0n) return err(ProtocolError.ZERO_MINT_AMOUNT)

  const priceResult = validateOracle(price, nowSeconds, params)
  if (!priceResult.ok) return err(priceResult.error)

  const newDebt = microStable(vault.debtMicroStable + amountMicroStable)

  if (newDebt > params.vaultMintCapMicroStable) return err(ProtocolError.VAULT_MINT_CAP_EXCEEDED)

  const mintable = maxMintable(
    vault.collateralMicroAlgo,
    vault.debtMicroStable,
    priceResult.value,
    params.minCollateralRatioBps
  )

  if (amountMicroStable > mintable) return err(ProtocolError.MINT_UNDERCOLLATERALISED)

  return ok(newDebt)
}

/**
 * Validate the mint against the protocol-wide debt ceiling.
 *
 * Call this *after* validateMint so per-vault checks are done first.
 */
export function validateProtocolDebtCeiling(
  mintAmount: MicroStable,
  currentTotalDebt: MicroStable,
  params: ProtocolParams
): Result<MicroStable, ProtocolError> {
  const newTotal = microStable(currentTotalDebt + mintAmount)
  if (newTotal > params.protocolDebtCeilingMicroStable) {
    return err(ProtocolError.PROTOCOL_DEBT_CEILING_EXCEEDED)
  }
  return ok(newTotal)
}
