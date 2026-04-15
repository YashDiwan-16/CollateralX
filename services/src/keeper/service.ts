import type { KeeperConfig } from "../config"
import { buildKeeperPlan } from "../domain/keeper"
import type { KeeperPlan, TxSubmission } from "../domain/types"
import type { ChainReader, LiquidationExecutor } from "../ports"
import type { JobStore } from "../infra/job-store"
import { withRetry } from "../infra/retry"
import type { Logger } from "../observability/logger"
import type { MetricsSink } from "../observability/metrics"
import { NoopMetricsSink } from "../observability/metrics"

export interface KeeperRunResult {
  plan: KeeperPlan
  submitted: Array<{ vaultId: bigint; tx: TxSubmission }>
  dryRun: Array<{ vaultId: bigint; jobKey: string }>
  skippedJobs: Array<{ vaultId: bigint; jobKey: string; reason: string }>
}

export class KeeperService {
  constructor(
    private readonly chain: ChainReader & Partial<LiquidationExecutor>,
    private readonly jobs: JobStore,
    private readonly config: KeeperConfig,
    private readonly logger: Logger,
    private readonly metrics: MetricsSink = new NoopMetricsSink()
  ) {}

  async runOnce(nowSeconds = BigInt(Math.floor(Date.now() / 1000))): Promise<KeeperRunResult> {
    const start = Date.now()
    const state = await this.chain.loadProtocolState()
    const plan = buildKeeperPlan(
      state,
      {
        executionEnabled: this.config.executionEnabled,
        dryRun: this.config.dryRun,
        maxLiquidationsPerRun: this.config.maxLiquidationsPerRun,
        maxDebtMicroStablePerRun: this.config.maxDebtMicroStablePerRun,
        minLiquidationGapBps: this.config.minLiquidationGapBps,
        staleOracleBlocksExecution: true,
        blockedVaultIds: this.config.blockedVaultIds,
        allowedVaultIds: this.config.allowedVaultIds,
      },
      nowSeconds
    )

    this.metrics.gauge("keeper.vaults_scanned", plan.scannedVaults)
    this.metrics.gauge("keeper.candidates", plan.candidates.length)
    this.logger.info("keeper scan complete", {
      scannedVaults: plan.scannedVaults,
      candidates: plan.candidates.length,
      decisions: plan.decisions.length,
      dryRun: this.config.dryRun,
      executionEnabled: this.config.executionEnabled,
    })

    const submitted: KeeperRunResult["submitted"] = []
    const dryRun: KeeperRunResult["dryRun"] = []
    const skippedJobs: KeeperRunResult["skippedJobs"] = []

    for (const decision of plan.decisions) {
      if (decision.kind !== "liquidate") continue
      const { candidate, jobKey } = decision
      const started = await this.jobs.begin(jobKey)
      if (!started) {
        skippedJobs.push({ vaultId: candidate.vault.id, jobKey, reason: "already-started-or-completed" })
        this.metrics.increment("keeper.jobs_skipped", 1, { reason: "idempotent" })
        continue
      }

      if (this.config.dryRun || !this.config.executionEnabled) {
        await this.jobs.complete(jobKey, "dry-run")
        dryRun.push({ vaultId: candidate.vault.id, jobKey })
        this.metrics.increment("keeper.liquidations_dry_run")
        this.logger.info("liquidation dry run", {
          vaultId: candidate.vault.id,
          ratioBps: candidate.collateralRatioBps,
          repayAmountMicroStable: candidate.repayAmountMicroStable,
          jobKey,
        })
        continue
      }

      if (!this.chain.submitLiquidation) {
        const error = new Error("Chain client does not support liquidation execution")
        await this.jobs.fail(jobKey, error)
        throw error
      }

      try {
        const tx = await withRetry(
          `liquidate vault ${candidate.vault.id.toString()}`,
          this.config.retry,
          () => this.chain.submitLiquidation!(candidate),
          this.logger
        )
        await this.jobs.complete(jobKey, tx.txId)
        submitted.push({ vaultId: candidate.vault.id, tx })
        this.metrics.increment("keeper.liquidations_submitted")
        this.logger.info("liquidation submitted", { vaultId: candidate.vault.id, txId: tx.txId, jobKey })
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error))
        await this.jobs.fail(jobKey, normalized)
        this.metrics.increment("keeper.liquidations_failed")
        this.logger.error("liquidation failed", {
          vaultId: candidate.vault.id,
          jobKey,
          error: normalized.message,
        })
      }
    }

    this.metrics.observe("keeper.run_ms", Date.now() - start)
    return { plan, submitted, dryRun, skippedJobs }
  }
}
