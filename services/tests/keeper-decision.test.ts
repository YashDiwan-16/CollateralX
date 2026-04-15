import { describe, expect, it } from "vitest"
import { buildKeeperPlan } from "../src/domain/keeper"
import { discoverLiquidationCandidates } from "../src/domain/math"
import type { KeeperGuardrails } from "../src/domain/types"
import { protocolState, vault } from "./fixtures"

function guardrails(overrides: Partial<KeeperGuardrails> = {}): KeeperGuardrails {
  return {
    executionEnabled: false,
    dryRun: true,
    maxLiquidationsPerRun: 10,
    maxDebtMicroStablePerRun: 10_000_000n * 1_000_000n,
    minLiquidationGapBps: 0n,
    staleOracleBlocksExecution: true,
    blockedVaultIds: new Set(),
    ...overrides,
  }
}

describe("keeper decision logic", () => {
  it("identifies liquidatable vaults using pure protocol math", () => {
    const state = protocolState()

    const candidates = discoverLiquidationCandidates(state, 1_700_000_160n)

    expect(candidates.map((candidate) => candidate.vault.id)).toEqual([1n])
    expect(candidates[0]?.repayAmountMicroStable).toBe(800n * 1_000_000n)
  })

  it("blocks all liquidation decisions when oracle data is stale", () => {
    const state = protocolState({
      oracle: {
        ...protocolState().oracle,
        updatedAt: 1_699_999_000n,
        isFresh: false,
      },
    })

    const plan = buildKeeperPlan(state, guardrails(), 1_700_000_160n)

    expect(plan.decisions).toHaveLength(0)
    expect(plan.skipped.every((decision) => decision.kind === "skip" && decision.reason === "oracle-stale")).toBe(true)
  })

  it("uses a guard band to avoid threshold-edge liquidations", () => {
    const state = protocolState({
      vaults: [vault({ id: 7n, collateralMicroAlgo: 150n * 1_000_000n, debtMicroStable: 100n * 1_000_000n })],
    })

    const exactThreshold = buildKeeperPlan(state, guardrails({ minLiquidationGapBps: 0n }), 1_700_000_160n)
    const guarded = buildKeeperPlan(state, guardrails({ minLiquidationGapBps: 25n }), 1_700_000_160n)

    expect(exactThreshold.decisions).toHaveLength(1)
    expect(guarded.decisions).toHaveLength(0)
    expect(guarded.skipped.some((decision) => decision.kind === "skip" && decision.reason === "inside-guard-band")).toBe(true)
  })

  it("enforces per-run count and debt guardrails", () => {
    const state = protocolState({
      vaults: [
        vault({ id: 1n, debtMicroStable: 900n * 1_000_000n }),
        vault({ id: 2n, debtMicroStable: 800n * 1_000_000n }),
        vault({ id: 3n, debtMicroStable: 700n * 1_000_000n }),
      ],
    })

    const plan = buildKeeperPlan(
      state,
      guardrails({
        maxLiquidationsPerRun: 2,
        maxDebtMicroStablePerRun: 1_500n * 1_000_000n,
      }),
      1_700_000_160n
    )

    expect(plan.decisions.map((decision) => decision.kind === "liquidate" && decision.candidate.vault.id)).toEqual([1n])
    expect(plan.skipped.some((decision) => decision.kind === "skip" && decision.reason === "max-debt-per-run")).toBe(true)
  })
})
