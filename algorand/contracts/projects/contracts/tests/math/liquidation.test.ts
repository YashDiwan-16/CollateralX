import { describe, expect, it } from "vitest"
import { isLiquidatable, liquidationOutcome } from "../../src/math/liquidation"
import { ProtocolError } from "../../src/math/errors"
import { microAlgo, microStable, microUsd, seconds } from "../../src/math/types"
import { MICRO_DENOMINATOR } from "../../src/math/constants"
import { DEFAULT_PARAMS, makeVault, makeVaultMicro, NOW, PRICE_1USD, params, stalePrice } from "./helpers"

// ── isLiquidatable ────────────────────────────────────────────────────────

describe("isLiquidatable", () => {
  it("vault with zero debt is NOT liquidatable", () => {
    const vault = makeVault(1000n, 0n)
    const res = isLiquidatable(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(false)
  })

  it("healthy vault at 200 % is NOT liquidatable", () => {
    const vault = makeVault(200n, 100n)
    const res = isLiquidatable(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(false)
  })

  it("vault exactly at 150 % IS liquidatable", () => {
    const vault = makeVault(150n, 100n)
    const res = isLiquidatable(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(true)
  })

  it("vault below 150 % IS liquidatable", () => {
    const vault = makeVault(140n, 100n)
    const res = isLiquidatable(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(true)
  })

  it("vault with collateral = 0 and debt > 0 IS liquidatable", () => {
    const vault = makeVaultMicro(0n, 1_000_000n)
    const res = isLiquidatable(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(true)
  })

  it("stale oracle returns STALE_ORACLE error", () => {
    const vault = makeVault(140n, 100n)
    const res = isLiquidatable(vault, stalePrice(), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.STALE_ORACLE)
  })
})

// ── liquidationOutcome ────────────────────────────────────────────────────

describe("liquidationOutcome", () => {
  it("rejects healthy vault", () => {
    const vault = makeVault(300n, 100n) // 300 %
    const res = liquidationOutcome(vault, microStable(50n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.NOT_LIQUIDATABLE)
  })

  it("rejects zero repay amount", () => {
    const vault = makeVault(140n, 100n)
    const res = liquidationOutcome(vault, microStable(0n), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.ZERO_LIQUIDATION_AMOUNT)
  })

  it("rejects repay exceeding debt", () => {
    const vault = makeVault(140n, 100n)
    const res = liquidationOutcome(vault, microStable(101n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.LIQUIDATION_EXCEEDS_DEBT)
  })

  it("rejects vault with no collateral", () => {
    const vault = makeVaultMicro(0n, 100n * MICRO_DENOMINATOR)
    const res = liquidationOutcome(vault, microStable(50n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.NO_COLLATERAL_TO_SEIZE)
  })

  it("partial liquidation: correct debt reduction and collateral seized", () => {
    // 140 ALGO @ $1, debt = $100 → ratio 140 % (liquidatable)
    // Repay $50; bonus = 5 %, penalty = 10 %
    // repay_μUsd = 50e6; seized_μUsd = 50e6 × 1.05 = 52.5e6; penalty_μUsd = 50e6 × 0.10 = 5e6
    // seized_μAlgo = ceil(52.5e6 × 1e6 / 1e6) = 52.5e6 μAlgo = 52.5 ALGO
    // penalty_μAlgo = floor(5e6 × 1e6 / 1e6) = 5e6 μAlgo = 5 ALGO
    // liquidator = 52.5 − 5 = 47.5 ALGO
    const vault = makeVault(140n, 100n)
    const res = liquidationOutcome(vault, microStable(50n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    const { totalSeizedMicroAlgo, liquidatorReceivesMicroAlgo, protocolFeeMicroAlgo, debtReduced, vaultAfter } = res.value
    expect(debtReduced).toBe(50n * MICRO_DENOMINATOR)
    expect(vaultAfter.debtMicroStable).toBe(50n * MICRO_DENOMINATOR)
    // seized = 52_500_000 μAlgo (52.5 ALGO)
    expect(totalSeizedMicroAlgo).toBe(52_500_000n)
    // penalty = 5_000_000 μAlgo (5 ALGO)
    expect(protocolFeeMicroAlgo).toBe(5_000_000n)
    // liquidator = 47_500_000 μAlgo (47.5 ALGO)
    expect(liquidatorReceivesMicroAlgo).toBe(47_500_000n)
    // vault collateral = 140 − 52.5 = 87.5 ALGO
    expect(vaultAfter.collateralMicroAlgo).toBe(140n * MICRO_DENOMINATOR - 52_500_000n)
  })

  it("full liquidation: vault collateral exhausted", () => {
    // 100 ALGO @ $1, debt = $100 → 100 % (liquidatable)
    // Full repay $100; seized_μUsd = 100e6 × 1.05 = 105e6 > vault collateral 100e6
    // → seized capped at 100 ALGO
    const vault = makeVault(100n, 100n)
    const res = liquidationOutcome(vault, microStable(100n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.value.vaultAfter.collateralMicroAlgo).toBe(0n)
    expect(res.value.vaultAfter.debtMicroStable).toBe(0n)
  })

  it("emergency pause blocks liquidation", () => {
    const vault = makeVault(140n, 100n)
    const res = liquidationOutcome(vault, microStable(50n * MICRO_DENOMINATOR), PRICE_1USD, NOW, params({ emergencyPaused: true }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.EMERGENCY_PAUSED)
  })
})
