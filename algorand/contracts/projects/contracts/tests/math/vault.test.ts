import { describe, expect, it } from "vitest"
import {
  applyClose,
  applyDeposit,
  applyMint,
  applyRepay,
  applyWithdraw,
  collateralRatioBps,
  collateralValueMicroUsd,
  isHealthy,
  vaultHealth,
} from "../../src/math/vault"
import { ProtocolError } from "../../src/math/errors"
import { bps, microAlgo, microStable, microUsd, seconds } from "../../src/math/types"
import { MICRO_DENOMINATOR } from "../../src/math/constants"
import { DEFAULT_PARAMS, makeVault, makeVaultMicro, NOW, PRICE_1USD, PRICE_38C, params, stalePrice } from "./helpers"

// ── collateralValueMicroUsd ───────────────────────────────────────────────

describe("collateralValueMicroUsd", () => {
  it("100 ALGO @ $1 = $100 in μUsd", () => {
    const val = collateralValueMicroUsd(
      microAlgo(100n * MICRO_DENOMINATOR),
      microUsd(1_000_000n) // $1
    )
    expect(val).toBe(100n * MICRO_DENOMINATOR)
  })

  it("0 collateral → 0 value", () => {
    expect(collateralValueMicroUsd(microAlgo(0n), microUsd(1_000_000n))).toBe(0n)
  })

  it("fractional ALGO (0.5 ALGO @ $1)", () => {
    const val = collateralValueMicroUsd(microAlgo(500_000n), microUsd(1_000_000n))
    expect(val).toBe(500_000n) // $0.50 in μUsd
  })
})

// ── collateralRatioBps ────────────────────────────────────────────────────

describe("collateralRatioBps", () => {
  it("returns null when debt is zero", () => {
    expect(collateralRatioBps(microAlgo(1_000n), microStable(0n), microUsd(1_000_000n))).toBeNull()
  })

  it("150 % ratio: 150 ALGO @ $1, debt $100", () => {
    const ratio = collateralRatioBps(
      microAlgo(150n * MICRO_DENOMINATOR),
      microStable(100n * MICRO_DENOMINATOR),
      microUsd(1_000_000n)
    )
    expect(ratio).toBe(15_000n) // 15 000 bps = 150 %
  })

  it("200 % ratio: 200 ALGO @ $1, debt $100", () => {
    const ratio = collateralRatioBps(
      microAlgo(200n * MICRO_DENOMINATOR),
      microStable(100n * MICRO_DENOMINATOR),
      microUsd(1_000_000n)
    )
    expect(ratio).toBe(20_000n)
  })
})

// ── isHealthy ─────────────────────────────────────────────────────────────

describe("isHealthy", () => {
  it("zero debt is always healthy", () => {
    expect(isHealthy(microAlgo(0n), microStable(0n), microUsd(1_000_000n), bps(15_000n))).toBe(true)
  })

  it("200 % is healthy at 150 % min", () => {
    expect(
      isHealthy(
        microAlgo(200n * MICRO_DENOMINATOR),
        microStable(100n * MICRO_DENOMINATOR),
        microUsd(1_000_000n),
        bps(15_000n)
      )
    ).toBe(true)
  })

  it("exactly 150 % is healthy", () => {
    expect(
      isHealthy(
        microAlgo(150n * MICRO_DENOMINATOR),
        microStable(100n * MICRO_DENOMINATOR),
        microUsd(1_000_000n),
        bps(15_000n)
      )
    ).toBe(true)
  })

  it("149 % is NOT healthy", () => {
    expect(
      isHealthy(
        microAlgo(149n * MICRO_DENOMINATOR),
        microStable(100n * MICRO_DENOMINATOR),
        microUsd(1_000_000n),
        bps(15_000n)
      )
    ).toBe(false)
  })
})

// ── vaultHealth ───────────────────────────────────────────────────────────

describe("vaultHealth", () => {
  it("empty vault → status empty", () => {
    const vault = makeVaultMicro(0n, 0n)
    const res = vaultHealth(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.status).toBe("empty")
  })

  it("stale oracle → STALE_ORACLE error", () => {
    const vault = makeVault(100n, 50n)
    const res = vaultHealth(vault, stalePrice(), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.STALE_ORACLE)
  })

  it("200 % ratio → safe", () => {
    const vault = makeVault(200n, 100n) // $1 price → 200 %
    const res = vaultHealth(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.status).toBe("safe")
  })

  it("160 % ratio → warn band", () => {
    const vault = makeVault(160n, 100n)
    const res = vaultHealth(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.status).toBe("warn")
  })

  it("151 % ratio → danger band", () => {
    const vault = makeVault(151n, 100n)
    const res = vaultHealth(vault, PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.status).toBe("danger")
  })
})

// ── applyDeposit ──────────────────────────────────────────────────────────

describe("applyDeposit", () => {
  it("adds collateral", () => {
    const vault = makeVault(100n, 0n)
    const res = applyDeposit(vault, microAlgo(50n * MICRO_DENOMINATOR), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.collateralMicroAlgo).toBe(150n * MICRO_DENOMINATOR)
  })

  it("blocked when emergency paused", () => {
    const vault = makeVault(100n, 0n)
    const res = applyDeposit(vault, microAlgo(1n * MICRO_DENOMINATOR), NOW, params({ emergencyPaused: true }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.EMERGENCY_PAUSED)
  })
})

// ── applyWithdraw ─────────────────────────────────────────────────────────

describe("applyWithdraw", () => {
  it("allows safe withdrawal", () => {
    const vault = makeVault(300n, 100n) // 300 % ratio at $1
    const res = applyWithdraw(vault, microAlgo(100n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.collateralMicroAlgo).toBe(200n * MICRO_DENOMINATOR)
  })

  it("rejects withdrawal that breaches minimum ratio", () => {
    const vault = makeVault(160n, 100n) // 160 % → withdrawing 20 → 140 %
    const res = applyWithdraw(vault, microAlgo(20n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.UNDERCOLLATERALISED)
  })

  it("rejects withdrawal above collateral balance", () => {
    const vault = makeVault(50n, 0n)
    const res = applyWithdraw(vault, microAlgo(51n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.INSUFFICIENT_COLLATERAL)
  })

  it("stale oracle blocks withdrawal", () => {
    const vault = makeVault(300n, 100n)
    const res = applyWithdraw(vault, microAlgo(1n), stalePrice(), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.STALE_ORACLE)
  })
})

// ── applyMint ─────────────────────────────────────────────────────────────

describe("applyMint", () => {
  it("mints up to safe limit", () => {
    const vault = makeVault(300n, 0n)
    // max mintable at $1 and 150% = 300/1.5 = 200 algoUSD
    const res = applyMint(vault, microStable(200n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS, microStable(0n))
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.debtMicroStable).toBe(200n * MICRO_DENOMINATOR)
  })

  it("rejects zero mint", () => {
    const vault = makeVault(300n, 0n)
    const res = applyMint(vault, microStable(0n), PRICE_1USD, NOW, DEFAULT_PARAMS, microStable(0n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.ZERO_MINT_AMOUNT)
  })

  it("rejects mint that undercollateralises", () => {
    const vault = makeVault(150n, 0n)
    // max = 150/1.5 = 100; requesting 101
    const res = applyMint(vault, microStable(101n * MICRO_DENOMINATOR), PRICE_1USD, NOW, DEFAULT_PARAMS, microStable(0n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.MINT_UNDERCOLLATERALISED)
  })

  it("rejects when mint paused", () => {
    const vault = makeVault(300n, 0n)
    const res = applyMint(vault, microStable(10n * MICRO_DENOMINATOR), PRICE_1USD, NOW, params({ mintPaused: true }), microStable(0n))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.MINT_PAUSED)
  })
})

// ── applyRepay ────────────────────────────────────────────────────────────

describe("applyRepay", () => {
  it("reduces debt", () => {
    const vault = makeVault(300n, 100n)
    const res = applyRepay(vault, microStable(40n * MICRO_DENOMINATOR), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.debtMicroStable).toBe(60n * MICRO_DENOMINATOR)
  })

  it("allows full repayment → zero debt", () => {
    const vault = makeVault(300n, 100n)
    const res = applyRepay(vault, microStable(100n * MICRO_DENOMINATOR), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.value.debtMicroStable).toBe(0n)
  })

  it("rejects repay above debt", () => {
    const vault = makeVault(300n, 100n)
    const res = applyRepay(vault, microStable(101n * MICRO_DENOMINATOR), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.REPAY_EXCEEDS_DEBT)
  })

  it("rejects partial repay that leaves dust below floor", () => {
    // floor = 1 algoUSD = 1e6 μStable; debt = 1.4 algoUSD; repay 1 → 0.4 left
    const vault = makeVaultMicro(1_000_000_000n, 1_400_000n)
    const res = applyRepay(vault, microStable(1_000_000n), NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.BELOW_DEBT_FLOOR)
  })
})

// ── applyClose ────────────────────────────────────────────────────────────

describe("applyClose", () => {
  it("closes a debt-free vault", () => {
    const vault = makeVault(100n, 0n)
    const res = applyClose(vault, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.value.collateralMicroAlgo).toBe(0n)
      expect(res.value.debtMicroStable).toBe(0n)
    }
  })

  it("rejects close when debt exists", () => {
    const vault = makeVault(300n, 100n)
    const res = applyClose(vault, NOW, DEFAULT_PARAMS)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(ProtocolError.DEBT_NOT_ZERO)
  })
})
