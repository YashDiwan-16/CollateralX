/**
 * Branded primitive types and domain models for the CollateralX protocol.
 *
 * Branded types prevent accidental mixing of amounts in different units at the
 * TypeScript level — the runtime representation is always bigint.
 */

// ── Branded scalars ───────────────────────────────────────────────────────

declare const __microAlgoBrand: unique symbol
declare const __microStableBrand: unique symbol
declare const __microUsdBrand: unique symbol
declare const __bpsBrand: unique symbol
declare const __secondsBrand: unique symbol

/** Amount of ALGO in micro-units (1 ALGO = 1_000_000 μALGO). */
export type MicroAlgo = bigint & { readonly [__microAlgoBrand]: true }

/** Amount of algoUSD in micro-units (1 algoUSD = 1_000_000 μStable). */
export type MicroStable = bigint & { readonly [__microStableBrand]: true }

/**
 * USD value in micro-units (1 USD = 1_000_000 μUsd).
 * Used for oracle prices expressed as USD per ALGO.
 */
export type MicroUsd = bigint & { readonly [__microUsdBrand]: true }

/** Basis points — 10 000 bps = 100 %. */
export type Bps = bigint & { readonly [__bpsBrand]: true }

/** UNIX timestamp or duration in whole seconds. */
export type Seconds = bigint & { readonly [__secondsBrand]: true }

// ── Constructors ──────────────────────────────────────────────────────────

export const microAlgo = (n: bigint): MicroAlgo => n as MicroAlgo
export const microStable = (n: bigint): MicroStable => n as MicroStable
export const microUsd = (n: bigint): MicroUsd => n as MicroUsd
export const bps = (n: bigint): Bps => n as Bps
export const seconds = (n: bigint): Seconds => n as Seconds

// ── Oracle ────────────────────────────────────────────────────────────────

export interface OraclePrice {
  /** Price of 1 ALGO expressed in μUsd (e.g. $0.38 → 380_000n). */
  readonly pricePerAlgoMicroUsd: MicroUsd
  /** UNIX timestamp (seconds) when this price was last updated. */
  readonly updatedAt: Seconds
}

// ── Vault state ───────────────────────────────────────────────────────────

export interface VaultState {
  /** Unique vault identifier (e.g. Algorand address or numeric ID). */
  readonly id: string
  /** Owner's Algorand address. */
  readonly owner: string
  /** ALGO locked in this vault (μALGO). */
  readonly collateralMicroAlgo: MicroAlgo
  /** algoUSD minted against this vault (μStable). */
  readonly debtMicroStable: MicroStable
  /** Timestamp of last state-changing operation (seconds). */
  readonly lastUpdatedAt: Seconds
}

// ── Vault health / status ─────────────────────────────────────────────────

export type VaultStatus = "safe" | "warn" | "danger" | "empty"

export interface VaultHealth {
  /** Collateral ratio in bps (collateral_usd / debt_usd × 10_000). Null when debt = 0. */
  readonly collateralRatioBps: Bps | null
  /** Current status band. */
  readonly status: VaultStatus
  /** ALGO price at which this vault becomes liquidatable (μUsd). Null when debt = 0. */
  readonly liquidationPriceMicroUsd: MicroUsd | null
}

// ── Protocol parameters ───────────────────────────────────────────────────

export interface ProtocolParams {
  /** Ratio below which new mints are rejected and the vault is considered undercollateralised (bps). */
  readonly minCollateralRatioBps: Bps
  /** Ratio at or below which a vault can be liquidated (bps). */
  readonly liquidationRatioBps: Bps
  /** Fraction of vault collateral seized as protocol fee on liquidation (bps). */
  readonly liquidationPenaltyBps: Bps
  /** Extra collateral awarded to the liquidator above the debt repaid (bps). */
  readonly liquidationBonusBps: Bps
  /** Price data older than this is rejected as stale (seconds). */
  readonly oracleFreshnessWindowSeconds: Seconds
  /** Maximum algoUSD mintable by a single vault (μStable). */
  readonly vaultMintCapMicroStable: MicroStable
  /** Maximum total algoUSD outstanding protocol-wide (μStable). */
  readonly protocolDebtCeilingMicroStable: MicroStable
  /** Minimum debt a vault must carry after a partial repay (μStable). Prevents dust. */
  readonly minDebtFloorMicroStable: MicroStable
  /** If true, all minting and borrowing operations are paused. */
  readonly mintPaused: boolean
  /** If true, ALL protocol operations are paused (emergency). */
  readonly emergencyPaused: boolean
}

// ── Protocol-wide state ───────────────────────────────────────────────────

export interface ProtocolState {
  /** Sum of all vault debts (μStable). */
  readonly totalDebtMicroStable: MicroStable
  /** Sum of all vault collateral (μALGO). */
  readonly totalCollateralMicroAlgo: MicroAlgo
}

// ── Result<T, E> ──────────────────────────────────────────────────────────

export type Ok<T> = { readonly ok: true; readonly value: T }
export type Err<E> = { readonly ok: false; readonly error: E }
export type Result<T, E> = Ok<T> | Err<E>

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value })
export const err = <E>(error: E): Err<E> => ({ ok: false, error })
