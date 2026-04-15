import { describe, expect, it } from "vitest"
import { maxMintable, validateMint, validateProtocolDebtCeiling } from "../../src/math/minting"
import { ProtocolError } from "../../src/math/errors"
import { bps, microAlgo, microStable, microUsd } from "../../src/math/types"
import { MICRO_DENOMINATOR, DEFAULT_VAULT_MINT_CAP_MICRO_STABLE, DEFAULT_PROTOCOL_DEBT_CEILING_MICRO_STABLE } from "../../src/math/constants"
import { DEFAULT_PARAMS, makeVault, makeVaultMicro, NOW, PRICE_1USD, params } from "./helpers"

// ── maxMintable ───────────────────────────────────────────────────────────

describe("maxMintable", () => {
  it("300 ALGO @ $1, 0 debt, 150 % min → can mint 200 algoUSD", () => {
    const result = maxMintable(
      microAlgo(300n * MICRO_DENOMINATOR),
      microStable(0n),
      microUsd(1_000_000n),
      bps(15_000n)
    )
    expect(result).toBe(200n * MICRO_DENOMINATOR)
  })

  it("300 ALGO @ $1, 100 debt, 150 % min → can mint 100 more", () => {
    const result = maxMintable(
      microAlgo(300n * MICRO_DENOMINATOR),
      microStable(100n * MICRO_DENOMINATOR),
      microUsd(1_000_000n),
      bps(15_000n)
    )
    expect(result).toBe(100n * MICRO_DENOMINATOR)
  })

  it("returns 0 when already at capacity", () => {
    const result = maxMintable(
      microAlgo(150n * MICRO_DENOMINATOR),
      microStable(100n * MICRO_DENOMINATOR),
      microUsd(1_000_000n),
      bps(15_000n)
    )
    expect(result).toBe(0n)
  })

  it("returns 0 when over capacity (healthy vault, debt just at ratio limit)", () => {
    // 200 % with 200 ALGO, $100 debt — adding 1 more μStable would undercollateralise
    const result = maxMintable(
      microAlgo(150n * MICRO_DENOMINATOR),
      microStable(101n * MICRO_DENOMINATOR), // over limit
      microUsd(1_000_000n),
      bps(15_000n)
    )
    expect(result).toBe(0n)
  })

  it("zero collateral → 0 mintable", () => {
    const result = maxMintable(microAlgo(0n), microStable(0n), microUsd(1_000_000n), bps(15_000n))
    expect(result).toBe(0n)
  })
})

// ── validateMint ──────────────────────────────────────────────────────────

describe("validateMint", () => {
  it("valid mint within limit", () => {
    const vault = makeVault(300n, 0n)
    const res = validateMint(vault, microStable(100n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(100n * MICRO_DENOMINATOR)
  })

  it("zero amount → ZERO_MINT_AMOUNT", () => {
    const vault = makeVault(300n, 0n)
    const res = validateMint(vault, microStable(0n), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.ZERO_MINT_AMOUNT)
  })

  it("undercollateralised → MINT_UNDERCOLLATERALISED", () => {
    const vault = makeVault(150n, 0n)
    const res = validateMint(vault, microStable(101n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.MINT_UNDERCOLLATERALISED)
  })

  it("per-vault cap exceeded → VAULT_MINT_CAP_EXCEEDED", () => {
    // cap = 1 000 000 algoUSD; vault with enough collateral
    const collateral = microAlgo(2_000_000n * MICRO_DENOMINATOR) // 2M ALGO
    const vault = makeVaultMicro(collateral, 0n)
    const overCap = microStable(DEFAULT_VAULT_MINT_CAP_MICRO_STABLE + 1n)
    const res = validateMint(vault, overCap, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.VAULT_MINT_CAP_EXCEEDED)
  })

  it("mint paused → MINT_PAUSED", () => {
    const vault = makeVault(300n, 0n)
    const res = validateMint(vault, microStable(10n * MICRO_DENOMINATOR), PRICE_1USD, NOW, params({ mintPaused: true }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.MINT_PAUSED)
  })
})

// ── validateProtocolDebtCeiling ───────────────────────────────────────────

describe("validateProtocolDebtCeiling", () => {
  it("within ceiling → returns new total", () => {
    const res = validateProtocolDebtCeiling(
      microStable(1_000n * MICRO_DENOMINATOR),
      microStable(0n),
      DEFAULT_PARAMS
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value).toBe(1_000n * MICRO_DENOMINATOR)
  })

  it("exactly at ceiling → ok", () => {
    const res = validateProtocolDebtCeiling(
      DEFAULT_PARAMS.protocolDebtCeilingMicroStable,
      microStable(0n),
      DEFAULT_PARAMS
    )
    expect(res.ok).toBe(true)
  })

  it("one above ceiling → PROTOCOL_DEBT_CEILING_EXCEEDED", () => {
    const res = validateProtocolDebtCeiling(
      microStable(DEFAULT_PROTOCOL_DEBT_CEILING_MICRO_STABLE + 1n),
      microStable(0n),
      DEFAULT_PARAMS
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.PROTOCOL_DEBT_CEILING_EXCEEDED)
  })
})
