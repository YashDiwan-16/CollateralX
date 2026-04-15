import { describe, expect, it } from "vitest"
import { MockChainClient } from "../src/chain/mock-chain"
import { MemoryJobStore } from "../src/infra/job-store"
import { KeeperService } from "../src/keeper/service"
import { MemoryLogger } from "../src/observability/logger"
import { InMemoryMetricsSink } from "../src/observability/metrics"
import type { KeeperConfig } from "../src/config"
import { protocolState } from "./fixtures"

function config(overrides: Partial<KeeperConfig> = {}): KeeperConfig {
  return {
    dryRun: true,
    executionEnabled: false,
    intervalMs: 1_000,
    maxLiquidationsPerRun: 2,
    maxDebtMicroStablePerRun: 10_000_000n * 1_000_000n,
    minLiquidationGapBps: 0n,
    jobStatePath: ":memory:",
    blockedVaultIds: new Set(),
    retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
    ...overrides,
  }
}

describe("KeeperService", () => {
  it("discovers candidates and records dry-run jobs idempotently", async () => {
    const chain = new MockChainClient(protocolState())
    const jobs = new MemoryJobStore()
    const service = new KeeperService(chain, jobs, config(), new MemoryLogger(), new InMemoryMetricsSink())

    const first = await service.runOnce(1_700_000_160n)
    const second = await service.runOnce(1_700_000_160n)

    expect(first.dryRun).toHaveLength(1)
    expect(second.skippedJobs).toHaveLength(1)
    expect(chain.liquidations).toHaveLength(0)
  })

  it("executes liquidation when explicit guardrails allow it", async () => {
    const chain = new MockChainClient(protocolState())
    const service = new KeeperService(
      chain,
      new MemoryJobStore(),
      config({ dryRun: false, executionEnabled: true }),
      new MemoryLogger(),
      new InMemoryMetricsSink()
    )

    const result = await service.runOnce(1_700_000_160n)

    expect(result.submitted).toHaveLength(1)
    expect(chain.liquidations.map((candidate) => candidate.vault.id)).toEqual([1n])
  })

  it("retries transient liquidation failures", async () => {
    const chain = new MockChainClient(protocolState())
    chain.failLiquidations = 1
    const service = new KeeperService(
      chain,
      new MemoryJobStore(),
      config({ dryRun: false, executionEnabled: true }),
      new MemoryLogger(),
      new InMemoryMetricsSink()
    )

    const result = await service.runOnce(1_700_000_160n)

    expect(result.submitted).toHaveLength(1)
    expect(chain.liquidations).toHaveLength(1)
  })
})
