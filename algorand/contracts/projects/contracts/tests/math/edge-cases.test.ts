/**
 * Edge-case tests covering boundary conditions, dust, sequential operations,
 * and maximum-value safety.
 */
import { describe, expect, it } from "vitest"
import { applyDeposit, applyMint, applyRepay, applyWithdraw, collateralRatioBps, isHealthy } from "../../src/math/vault"
import { isLiquidatable, liquidationOutcome } from "../../src/math/liquidation"
import { maxMintable } from "../../src/math/minting"
import { ProtocolError } from "../../src/math/errors"
import { bps, microAlgo, microStable, microUsd, seconds } from "../../src/math/types"
import {
  BPS_DENOMINATOR,
  DEFAULT_LIQUIDATION_RATIO_BPS,
  MICRO_DENOMINATOR,
  MAX_MICRO_ALGO,
  MAX_MICRO_STABLE,
} from "../../src/math/constants"
import { DEFAULT_PARAMS, makeVault, makeVaultMicro, NOW, PRICE_1USD, PRICE_38C, params, stalePrice } from "./helpers"

// ── Zero collateral / zero debt ───────────────────────────────────────────

describe("zero collateral, zero debt", () => {
  it("collateralRatioBps returns null for zero debt", () => {
    expect(collateralRatioBps(microAlgo(0n), microStable(0n), microUsd(1_000_000n))).toBeNull()
  })

  it("isHealthy returns true for zero debt (always safe)", () => {
    expect(isHealthy(microAlgo(0n), microStable(0n), microUsd(1_000_000n), bps(15_000n))).toBe(true)
  })

  it("deposit on zero-collateral vault works", () => {
    const vault = makeVaultMicro(0n, 0n)
    const res = applyDeposit(vault, microAlgo(1_000_000n), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
  })

  it("maxMintable is 0 when collateral is 0", () => {
    expect(maxMintable(microAlgo(0n), microStable(0n), microUsd(1_000_000n), bps(15_000n))).toBe(0n)
  })
})

// ── Exact threshold boundaries ────────────────────────────────────────────

describe("exact 150 % collateral ratio boundary", () => {
  // 150 ALGO @ $1, $100 debt → exactly 150 %
  it("vault at exactly 150 % is healthy", () => {
    expect(
      isHealthy(microAlgo(150n * MICRO_DENOMINATOR), microStable(100n * MICRO_DENOMINATOR), microUsd(1_000_000n), bps(15_000n))
    ).toBe(true)
  })

  it("vault at exactly 150 % is liquidatable", () => {
    const vault = makeVault(150n, 100n)
    const res = isLiquidatable(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(true)
  })

  it("1 μAlgo below 150 ALGO → NOT healthy", () => {
    const collateral = microAlgo(150n * MICRO_DENOMINATOR - 1n)
    expect(isHealthy(collateral, microStable(100n * MICRO_DENOMINATOR), microUsd(1_000_000n), bps(15_000n))).toBe(false)
  })

  it("1 μAlgo above 150 ALGO → healthy", () => {
    const collateral = microAlgo(150n * MICRO_DENOMINATOR + 1n)
    expect(isHealthy(collateral, microStable(100n * MICRO_DENOMINATOR), microUsd(1_000_000n), bps(15_000n))).toBe(true)
  })
})

// ── Stale price ───────────────────────────────────────────────────────────

describe("stale oracle price", () => {
  it("withdraw with stale price → STALE_ORACLE", () => {
    const vault = makeVault(300n, 100n)
    const res = applyWithdraw(vault, microAlgo(MICRO_DENOMINATOR), stalePrice(), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.STALE_ORACLE)
  })

  it("mint with stale price → STALE_ORACLE", () => {
    const vault = makeVault(300n, 0n)
    const res = applyMint(vault, microStable(MICRO_DENOMINATOR), stalePrice(), NOW, DEFAULT_PARAMS, microStable(0n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.STALE_ORACLE)
  })

  it("liquidation with stale price → STALE_ORACLE", () => {
    const vault = makeVault(140n, 100n)
    const res = liquidationOutcome(vault, microStable(50n * MICRO_DENOMINATOR), stalePrice(), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.STALE_ORACLE)
  })

  it("price at exactly freshness boundary is valid", () => {
    const boundaryPrice = {
      pricePerAlgoMicroUsd: microUsd(1_000_000n),
      updatedAt: seconds(NOW - DEFAULT_PARAMS.oracleFreshnessWindowSeconds),
    }
    const vault = makeVault(300n, 0n)
    const res = applyMint(vault, microStable(MICRO_DENOMINATOR), boundaryPrice, NOW, DEFAULT_PARAMS, microStable(0n))
    expect(res.ok).toBe(true)
  })
})

// ── Dust / minimum debt floor ─────────────────────────────────────────────

describe("minimum debt floor (dust prevention)", () => {
  it("repaying to exactly 0 is allowed", () => {
    const vault = makeVaultMicro(1_000_000_000n, 1_000_000n) // 1 algoUSD debt
    const res = applyRepay(vault, microStable(1_000_000n), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.debtMicroStable).toBe(0n)
  })

  it("repaying to exactly 1 algoUSD (floor) is allowed", () => {
    const vault = makeVaultMicro(1_000_000_000n, 2_000_000n) // 2 algoUSD
    const res = applyRepay(vault, microStable(1_000_000n), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.debtMicroStable).toBe(1_000_000n)
  })

  it("partial repay leaving 0.5 algoUSD is rejected (below floor)", () => {
    const vault = makeVaultMicro(1_000_000_000n, 1_500_000n) // 1.5 algoUSD
    const res = applyRepay(vault, microStable(1_000_000n), NOW, DEFAULT_PARAMS) // leaves 0.5
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.BELOW_DEBT_FLOOR)
  })
})

// ── Sequential operations ─────────────────────────────────────────────────

describe("sequential deposit → mint → repay → withdraw", () => {
  it("happy path: full lifecycle", () => {
    let vault = makeVaultMicro(0n, 0n)
    let t = NOW

    // Step 1: deposit 300 ALGO
    t = seconds(t + 10n)
    const dep = applyDeposit(vault, microAlgo(300n * MICRO_DENOMINATOR), t, DEFAULT_PARAMS)
    expect(dep.ok).toBe(true)
    vault = (dep as { ok: true; value: typeof vault }).value

    // Step 2: mint 100 algoUSD (300 / 1.5 = 200 max)
    t = seconds(t + 10n)
    const mint = applyMint(vault, microStable(100n * MICRO_DENOMINATOR), PRICE_1USD, t, DEFAULT_PARAMS, microStable(0n))
    expect(mint.ok).toBe(true)
    vault = (mint as { ok: true; value: typeof vault }).value
    expect(vault.debtMicroStable).toBe(100n * MICRO_DENOMINATOR)

    // Step 3: partial repay 50
    t = seconds(t + 10n)
    const repay = applyRepay(vault, microStable(50n * MICRO_DENOMINATOR), t, DEFAULT_PARAMS)
    expect(repay.ok).toBe(true)
    vault = (repay as { ok: true; value: typeof vault }).value
    expect(vault.debtMicroStable).toBe(50n * MICRO_DENOMINATOR)

    // Step 4: withdraw 100 ALGO — leaves 200 ALGO vs $50 debt = 400 % ratio (safe)
    t = seconds(t + 10n)
    const withdraw = applyWithdraw(vault, microAlgo(100n * MICRO_DENOMINATOR), PRICE_1USD, t, DEFAULT_PARAMS)
    expect(withdraw.ok).toBe(true)
    vault = (withdraw as { ok: true; value: typeof vault }).value
    expect(vault.collateralMicroAlgo).toBe(200n * MICRO_DENOMINATOR)
  })

  it("price drop mid-lifecycle causes previously-safe withdrawal to fail", () => {
    // 200 ALGO, $80 debt at $1 = 250 % safe; at $0.38 the ratio drops
    // collateral_USD = 200 × 0.38 = $76 < 150% × $80 = $120 → unhealthy
    const vault = makeVault(200n, 80n)
    const res = applyWithdraw(vault, microAlgo(1n * MICRO_DENOMINATOR), PRICE_38C, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.UNDERCOLLATERALISED)
  })
})

// ── Maximum value safety ──────────────────────────────────────────────────

describe("large / max value arithmetic", () => {
  it("max collateral deposit doesn't overflow", () => {
    const vault = makeVaultMicro(0n, 0n)
    const res = applyDeposit(vault, microAlgo(MAX_MICRO_ALGO), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
  })

  it("collateral ratio is correct for large values", () => {
    const ratio = collateralRatioBps(
      microAlgo(MAX_MICRO_ALGO),
      microStable(MAX_MICRO_STABLE / 2n),
      microUsd(1_000_000n)
    )
    // ratio = (MAX_ALGO × 1 / (MAX_STABLE/2)) × 10000 = 2 × 10000 = 20000
    expect(ratio).toBe(20_000n)
  })

  it("maxMintable returns correct value for large collateral", () => {
    // 1B ALGO @ $1, 0 debt → 1B / 1.5 ≈ 666_666_666.666 algoUSD
    const collateral = microAlgo(1_000_000_000n * MICRO_DENOMINATOR)
    const mintable = maxMintable(collateral, microStable(0n), microUsd(1_000_000n), bps(15_000n))
    // floor(1e15 × 10000 / 15000) = floor(6.666...e14) = 666_666_666_666_666n μStable
    expect(mintable).toBe(666_666_666_666_666n)
  })
})

// ── Emergency / pause flags ───────────────────────────────────────────────

describe("emergency and mint pause", () => {
  it("emergency pause blocks deposit", () => {
    const vault = makeVault(100n, 0n)
    const res = applyDeposit(vault, microAlgo(MICRO_DENOMINATOR), NOW, params({ emergencyPaused: true }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.EMERGENCY_PAUSED)
  })

  it("emergency pause blocks repay", () => {
    const vault = makeVault(300n, 100n)
    const res = applyRepay(vault, microStable(10n * MICRO_DENOMINATOR), NOW, params({ emergencyPaused: true }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.EMERGENCY_PAUSED)
  })

  it("mint pause does NOT block repay or withdraw", () => {
    const vault = makeVault(300n, 100n)
    const p = params({ mintPaused: true })
    // repay should still work
    const repay = applyRepay(vault, microStable(10n * MICRO_DENOMINATOR), NOW, p)
    expect(repay.ok).toBe(true)
    // withdraw should still work
    const withdraw = applyWithdraw(vault, microAlgo(10n * MICRO_DENOMINATOR), PRICE_1USD, NOW, p)
    expect(withdraw.ok).toBe(true)
  })
})
