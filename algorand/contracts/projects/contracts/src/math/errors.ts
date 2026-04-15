/**
 * Protocol error codes.
 *
 * All pure math functions return Result<T, ProtocolError>; callers decide how
 * to surface or translate these codes.
 */
export const enum ProtocolError {
  // ── Oracle errors ──────────────────────────────────────────────────────
  /** Price timestamp is older than the freshness window. */
  STALE_ORACLE = "STALE_ORACLE",
  /** Oracle price is zero or negative — unusable. */
  INVALID_ORACLE_PRICE = "INVALID_ORACLE_PRICE",

  // ── Vault errors ───────────────────────────────────────────────────────
  /** Collateral amount is zero; nothing to work with. */
  ZERO_COLLATERAL = "ZERO_COLLATERAL",
  /** Attempting to withdraw more collateral than is in the vault. */
  INSUFFICIENT_COLLATERAL = "INSUFFICIENT_COLLATERAL",
  /** Withdrawal amount is zero. */
  ZERO_WITHDRAW_AMOUNT = "ZERO_WITHDRAW_AMOUNT",
  /** Repayment amount is zero. */
  ZERO_REPAY_AMOUNT = "ZERO_REPAY_AMOUNT",
  /** Attempting to repay more than the outstanding debt. */
  REPAY_EXCEEDS_DEBT = "REPAY_EXCEEDS_DEBT",
  /** Withdrawal would leave the vault below the minimum collateral ratio. */
  UNDERCOLLATERALISED = "UNDERCOLLATERALISED",
  /** Vault has non-zero debt and cannot be closed without full repayment. */
  DEBT_NOT_ZERO = "DEBT_NOT_ZERO",
  /** Vault has no debt; operation requires an existing debt position. */
  NO_DEBT = "NO_DEBT",

  // ── Mint errors ────────────────────────────────────────────────────────
  /** Mint amount is zero. */
  ZERO_MINT_AMOUNT = "ZERO_MINT_AMOUNT",
  /** Mint would push vault collateral ratio below the minimum. */
  MINT_UNDERCOLLATERALISED = "MINT_UNDERCOLLATERALISED",
  /** Mint would breach the per-vault cap. */
  VAULT_MINT_CAP_EXCEEDED = "VAULT_MINT_CAP_EXCEEDED",
  /** Mint would breach the protocol-wide debt ceiling. */
  PROTOCOL_DEBT_CEILING_EXCEEDED = "PROTOCOL_DEBT_CEILING_EXCEEDED",
  /** After a partial repay, remaining debt would be below the minimum floor. */
  BELOW_DEBT_FLOOR = "BELOW_DEBT_FLOOR",

  // ── Liquidation errors ─────────────────────────────────────────────────
  /** Vault is healthy; cannot be liquidated. */
  NOT_LIQUIDATABLE = "NOT_LIQUIDATABLE",
  /** Liquidation repay amount is zero. */
  ZERO_LIQUIDATION_AMOUNT = "ZERO_LIQUIDATION_AMOUNT",
  /** Liquidation repay amount exceeds the vault's debt. */
  LIQUIDATION_EXCEEDS_DEBT = "LIQUIDATION_EXCEEDS_DEBT",
  /** Vault has no collateral to seize. */
  NO_COLLATERAL_TO_SEIZE = "NO_COLLATERAL_TO_SEIZE",

  // ── Protocol state errors ──────────────────────────────────────────────
  /** Minting is paused by governance. */
  MINT_PAUSED = "MINT_PAUSED",
  /** All operations are paused (emergency mode). */
  EMERGENCY_PAUSED = "EMERGENCY_PAUSED",

  // ── Arithmetic errors ──────────────────────────────────────────────────
  /** Division by zero attempted inside a helper. */
  DIVISION_BY_ZERO = "DIVISION_BY_ZERO",
}
