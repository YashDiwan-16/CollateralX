import { loadConfig, type ServiceConfig } from "./config"
import { AlgorandProtocolClient } from "./chain/algorand-client"
import { FileJobStore } from "./infra/job-store"
import { JsonConsoleLogger } from "./observability/logger"
import { NoopMetricsSink } from "./observability/metrics"
import { KeeperService } from "./keeper/service"
import { HttpJsonOracleSource, StaticOracleSource } from "./oracle/sources"
import { OracleUpdaterService } from "./oracle/service"
import { ReadIndexerService } from "./read/indexer"
import { ReadModelStore } from "./read/store"
import { startReadApiServer } from "./read/server"

export function buildRuntime(config: ServiceConfig = loadConfig()) {
  const logger = new JsonConsoleLogger(config.logLevel)
  const metrics = new NoopMetricsSink()
  const chain = new AlgorandProtocolClient(config.chain)
  const jobs = new FileJobStore(config.keeper.jobStatePath)
  const keeper = new KeeperService(chain, jobs, config.keeper, logger, metrics)
  const readStore = new ReadModelStore()
  const readIndexer = new ReadIndexerService(chain, readStore, logger, metrics)

  return { config, logger, metrics, chain, jobs, keeper, readStore, readIndexer }
}

export function buildOracleRuntime(config: ServiceConfig = loadConfig()) {
  const runtime = buildRuntime(config)
  const oracleSource = config.oracle.sourceKind === "http"
    ? new HttpJsonOracleSource(required(config.oracle.httpUrl, "ORACLE_HTTP_URL"), config.oracle.sourceId)
    : new StaticOracleSource(required(config.oracle.staticPriceMicroUsd, "ORACLE_STATIC_PRICE_MICRO_USD"), config.oracle.sourceId)
  const oracle = new OracleUpdaterService(runtime.chain, oracleSource, config.oracle, runtime.logger, runtime.metrics)
  return { ...runtime, oracle }
}

export async function startReadRuntime(config: ServiceConfig = loadConfig()) {
  const runtime = buildRuntime(config)
  await runtime.readIndexer.refresh()
  const interval = setInterval(() => {
    runtime.readIndexer.refresh().catch((error: unknown) => {
      runtime.logger.error("read refresh failed", { error: error instanceof Error ? error.message : String(error) })
    })
  }, config.readApi.refreshIntervalMs)
  const server = await startReadApiServer(runtime.readStore, runtime.logger, config.readApi.port, runtime.metrics)
  server.on("close", () => clearInterval(interval))
  return { ...runtime, server, interval }
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined || value === null || value === "") throw new Error(`${name} is required`)
  return value
}
