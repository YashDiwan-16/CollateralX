/**
 * Protocol constants — all values are in their canonical unit (bigint).
 *
 * Units:
 *   MicroAlgo  : 1 ALGO  = 1_000_000 microAlgo
 *   MicroStable: 1 algoUSD = 1_000_000 microStable
 *   MicroUsd   : 1 USD   = 1_000_000 microUsd  (oracle price unit)
 *   Bps        : 1 % = 100 bps   (basis points)
 *   Seconds    : UNIX timestamp / duration
 */

// ── Scale denominators ─────────────────────────────────────────────────────

/** 10 000 — basis-point denominator (1 bps = 0.01 %) */
export const BPS_DENOMINATOR = 10_000n

/** 1 000 000 — micro-unit denominator */
export const MICRO_DENOMINATOR = 1_000_000n

// ── Protocol parameter defaults ───────────────────────────────────────────

/** Minimum collateral ratio: 150 % = 15 000 bps */
export const DEFAULT_MIN_COLLATERAL_RATIO_BPS = 15_000n

/** Liquidation triggers when ratio falls below 150 % = 15 000 bps */
export const DEFAULT_LIQUIDATION_RATIO_BPS = 15_000n

/** Penalty charged to the vault on liquidation: 10 % = 1 000 bps */
export const DEFAULT_LIQUIDATION_PENALTY_BPS = 1_000n

/** Bonus paid to the liquidator on top of debt repaid: 5 % = 500 bps */
export const DEFAULT_LIQUIDATION_BONUS_BPS = 500n

/** Oracle price considered stale after 5 minutes */
export const DEFAULT_ORACLE_FRESHNESS_WINDOW_SECONDS = 300n

/** Maximum algoUSD mintable per vault: 1 000 000 algoUSD = 1e12 microStable */
export const DEFAULT_VAULT_MINT_CAP_MICRO_STABLE = 1_000_000n * MICRO_DENOMINATOR

/** Protocol-wide algoUSD debt ceiling: 100 000 000 algoUSD = 1e14 microStable */
export const DEFAULT_PROTOCOL_DEBT_CEILING_MICRO_STABLE = 100_000_000n * MICRO_DENOMINATOR

/** Minimum debt that a vault must carry (prevents dust vaults): 1 algoUSD = 1e6 microStable */
export const DEFAULT_MIN_DEBT_FLOOR_MICRO_STABLE = 1n * MICRO_DENOMINATOR

// ── Safety bounds ─────────────────────────────────────────────────────────

/**
 * Maximum representable microAlgo ≈ 10 billion ALGO (well above total supply).
 * Used for overflow guard in tests; not enforced on-chain.
 */
export const MAX_MICRO_ALGO = 10_000_000_000n * MICRO_DENOMINATOR

/** Maximum representable microStable (same order of magnitude). */
export const MAX_MICRO_STABLE = 10_000_000_000n * MICRO_DENOMINATOR

/** Maximum oracle price per ALGO in microUsd: $10 000 */
export const MAX_MICRO_USD_PRICE = 10_000n * MICRO_DENOMINATOR

// ── Status bands ─────────────────────────────────────────────────────────

/** Ratio above which vault is "Safe": 180 % = 18 000 bps */
export const STATUS_SAFE_THRESHOLD_BPS = 18_000n

/** Ratio below which vault enters "Danger" zone: 155 % = 15 500 bps */
export const STATUS_DANGER_THRESHOLD_BPS = 15_500n
