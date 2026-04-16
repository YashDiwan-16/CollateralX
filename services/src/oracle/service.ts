import type { OracleConfig } from "../config"
import type { ChainReader, OraclePriceSource, OracleUpdater } from "../ports"
import type { TxSubmission } from "../domain/types"
import type { Logger } from "../observability/logger"
import type { MetricsSink } from "../observability/metrics"
import { NoopMetricsSink } from "../observability/metrics"
import { BPS_DENOMINATOR } from "../domain/math"
import { withRetry } from "../infra/retry"

export interface OracleUpdateResult {
  submitted?: TxSubmission
  dryRun?: boolean
  skipped?: string
  pricePerAlgoMicroUsd: bigint
  updatedRound: bigint
}

export class OracleUpdaterService {
  constructor(
    private readonly chain: ChainReader & Partial<OracleUpdater>,
    private readonly source: OraclePriceSource,
    private readonly config: OracleConfig,
    private readonly logger: Logger,
    private readonly metrics: MetricsSink = new NoopMetricsSink()
  ) {}

  async runOnce(nowSeconds = BigInt(Math.floor(Date.now() / 1000))): Promise<OracleUpdateResult> {
    const state = await this.chain.loadProtocolState()
    const sourceSample = await this.source.readPrice(state.oracle)
    const chainNow = await this.chain.getCurrentTimestamp?.() ?? nowSeconds
    const updatedRound = sourceSample.updatedRound ?? await this.chain.getCurrentRound?.() ?? state.oracle.updatedRound + 1n
    if (sourceSample.updatedAt !== undefined && sourceSample.updatedAt > chainNow) {
      throw new Error("oracle source timestamp is ahead of current chain time")
    }
    const updatedAt = sourceSample.updatedAt ?? chainNow
    const source = sourceSample.source.slice(0, 64)
    const pricePerAlgoMicroUsd = sourceSample.pricePerAlgoMicroUsd

    if (pricePerAlgoMicroUsd <= 0n) throw new Error("oracle price must be greater than zero")
    if (updatedRound <= state.oracle.updatedRound) {
      this.metrics.increment("oracle.updates_skipped", 1, { reason: "round-not-newer" })
      return { skipped: "round-not-newer", pricePerAlgoMicroUsd, updatedRound }
    }
    if (exceedsDeviation(pricePerAlgoMicroUsd, state.oracle.pricePerAlgoMicroUsd, this.config.maxDeviationBps)) {
      this.metrics.increment("oracle.updates_skipped", 1, { reason: "deviation-guard" })
      throw new Error("oracle price deviation exceeds configured guardrail")
    }

    const input = { pricePerAlgoMicroUsd, updatedAt, updatedRound, source }
    this.logger.info("oracle update prepared", {
      pricePerAlgoMicroUsd,
      updatedAt,
      updatedRound,
      source,
      dryRun: this.config.dryRun,
    })

    if (this.config.dryRun) {
      this.metrics.increment("oracle.updates_dry_run")
      return { dryRun: true, pricePerAlgoMicroUsd, updatedRound }
    }

    if (!this.chain.submitOracleUpdate) throw new Error("Chain client does not support oracle updates")
    const submitted = await withRetry("oracle update", this.config.retry, () => this.chain.submitOracleUpdate!(input), this.logger)
    this.metrics.increment("oracle.updates_submitted")
    this.logger.info("oracle update submitted", { txId: submitted.txId, updatedRound, pricePerAlgoMicroUsd })
    return { submitted, pricePerAlgoMicroUsd, updatedRound }
  }
}

export function exceedsDeviation(next: bigint, current: bigint, maxDeviationBps: bigint) {
  if (current <= 0n) return false
  const delta = next > current ? next - current : current - next
  return (delta * BPS_DENOMINATOR) / current > maxDeviationBps
}
