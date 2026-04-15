import { describe, expect, it } from "vitest"
import { MockChainClient } from "../src/chain/mock-chain"
import { OracleUpdaterService } from "../src/oracle/service"
import { StaticOracleSource } from "../src/oracle/sources"
import { MemoryLogger } from "../src/observability/logger"
import { protocolState } from "./fixtures"
import type { OracleConfig } from "../src/config"

function config(overrides: Partial<OracleConfig> = {}): OracleConfig {
  return {
    dryRun: true,
    sourceKind: "static",
    staticPriceMicroUsd: 1_010_000n,
    sourceId: "test",
    maxDeviationBps: 2_500n,
    retry: { attempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
    ...overrides,
  }
}

describe("OracleUpdaterService", () => {
  it("prepares valid dry-run oracle updates", async () => {
    const chain = new MockChainClient(protocolState())
    const service = new OracleUpdaterService(
      chain,
      new StaticOracleSource(1_010_000n, "test"),
      config(),
      new MemoryLogger()
    )

    const result = await service.runOnce(1_700_000_160n)

    expect(result.dryRun).toBe(true)
    expect(result.updatedRound).toBe(100n)
    expect(chain.oracleUpdates).toHaveLength(0)
  })

  it("submits when dry-run is disabled", async () => {
    const chain = new MockChainClient(protocolState())
    const service = new OracleUpdaterService(
      chain,
      new StaticOracleSource(1_010_000n, "test"),
      config({ dryRun: false }),
      new MemoryLogger()
    )

    await service.runOnce(1_700_000_160n)

    expect(chain.oracleUpdates).toHaveLength(1)
    expect(chain.oracleUpdates[0]?.pricePerAlgoMicroUsd).toBe(1_010_000n)
  })

  it("rejects invalid or aggressive oracle moves", async () => {
    const chain = new MockChainClient(protocolState())
    const service = new OracleUpdaterService(
      chain,
      new StaticOracleSource(2_000_000n, "test"),
      config({ maxDeviationBps: 100n }),
      new MemoryLogger()
    )

    await expect(service.runOnce(1_700_000_160n)).rejects.toThrow(/deviation/)
  })
})
