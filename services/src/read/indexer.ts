import type { ChainReader } from "../ports"
import type { Logger } from "../observability/logger"
import type { MetricsSink } from "../observability/metrics"
import { NoopMetricsSink } from "../observability/metrics"
import { ReadModelStore } from "./store"

export class ReadIndexerService {
  constructor(
    private readonly chain: ChainReader,
    private readonly store: ReadModelStore,
    private readonly logger: Logger,
    private readonly metrics: MetricsSink = new NoopMetricsSink()
  ) {}

  async refresh() {
    const start = Date.now()
    const [state, events] = await Promise.all([
      this.chain.loadProtocolState(),
      this.chain.loadIndexedEvents?.() ?? Promise.resolve([]),
    ])
    this.store.replaceSnapshot(state, events)
    this.metrics.increment("read_index.refresh_success")
    this.metrics.gauge("read_index.vaults", state.vaults.length)
    this.metrics.observe("read_index.refresh_ms", Date.now() - start)
    this.logger.info("read model refreshed", {
      vaults: state.vaults.length,
      oracleRound: state.oracle.updatedRound,
      events: events.length,
    })
    return state
  }
}
