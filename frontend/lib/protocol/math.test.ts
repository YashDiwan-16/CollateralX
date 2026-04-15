import { describe, expect, it } from "vitest"
import {
  collateralRatioBps,
  decimalToMicro,
  formatBps,
  formatUnixTimestampUtc,
  liquidationPriceMicroUsd,
  maxMintableMicroStable,
  maxWithdrawableMicroAlgo,
  microToDecimal,
} from "@/lib/protocol/math"
import { MICRO_ALGO, MICRO_STABLE } from "@/lib/protocol/constants"

describe("protocol math helpers", () => {
  it("parses and formats micro-denominated values without floating point drift", () => {
    expect(decimalToMicro("1.234567")).toBe(1_234_567n)
    expect(decimalToMicro("1.2345678")).toBe(1_234_567n)
    expect(microToDecimal(1_234_500n, 6, 4)).toBe("1.2345")
  })

  it("calculates collateral ratios in basis points", () => {
    const ratio = collateralRatioBps(150n * MICRO_ALGO, 100n * MICRO_STABLE, MICRO_STABLE)
    expect(ratio).toBe(15_000n)
    expect(formatBps(ratio)).toBe("150%")
  })

  it("calculates liquidation price with ceiling rounding", () => {
    const price = liquidationPriceMicroUsd(100n * MICRO_STABLE, 150n * MICRO_ALGO, 15_000n)
    expect(price).toBe(1_000_000n)
  })

  it("enforces the minimum ratio, vault cap, and aggregate debt cap for max mint", () => {
    const maxMint = maxMintableMicroStable({
      collateralMicroAlgo: 150n * MICRO_ALGO,
      debtMicroStable: 50n * MICRO_STABLE,
      pricePerAlgoMicroUsd: MICRO_STABLE,
      minCollateralRatioBps: 15_000n,
      vaultMintCapMicroStable: 120n * MICRO_STABLE,
      protocolDebtCeilingMicroStable: 140n * MICRO_STABLE,
      totalDebtMicroStable: 100n * MICRO_STABLE,
    })
    expect(maxMint).toBe(40n * MICRO_STABLE)
  })

  it("calculates withdrawable collateral after preserving post-action health", () => {
    const withdrawable = maxWithdrawableMicroAlgo({
      collateralMicroAlgo: 200n * MICRO_ALGO,
      debtMicroStable: 100n * MICRO_STABLE,
      pricePerAlgoMicroUsd: MICRO_STABLE,
      minCollateralRatioBps: 15_000n,
    })
    expect(withdrawable).toBe(50n * MICRO_ALGO)
  })

  it("formats unix timestamps deterministically for server and browser renders", () => {
    expect(formatUnixTimestampUtc(1_776_275_742n)).toBe("2026-04-15 17:55:42 UTC")
  })
})
