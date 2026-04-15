import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { serialize } from "./serialize"
import { ReadModelStore } from "./store"
import type { Logger } from "../observability/logger"
import type { MetricsSink } from "../observability/metrics"
import { NoopMetricsSink } from "../observability/metrics"

export function createReadApiServer(
  store: ReadModelStore,
  logger: Logger,
  metrics: MetricsSink = new NoopMetricsSink()
) {
  return createServer((request, response) => {
    void handleRequest(request, response, store, logger, metrics)
  })
}

export async function startReadApiServer(
  store: ReadModelStore,
  logger: Logger,
  port: number,
  metrics: MetricsSink = new NoopMetricsSink()
) {
  const server = createReadApiServer(store, logger, metrics)
  await new Promise<void>((resolve) => server.listen(port, resolve))
  const address = server.address() as AddressInfo
  logger.info("read api listening", { port: address.port })
  return server
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  store: ReadModelStore,
  logger: Logger,
  metrics: MetricsSink
) {
  const started = Date.now()
  const url = new URL(request.url ?? "/", "http://localhost")
  try {
    if (request.method !== "GET") {
      sendJson(response, 405, { error: "method_not_allowed" })
      return
    }

    const body = route(url, store)
    metrics.increment("read_api.requests", 1, { status: "ok", path: url.pathname })
    sendJson(response, 200, body)
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error"
    const status = message.includes("not been indexed") ? 503 : 404
    metrics.increment("read_api.requests", 1, { status: "error", path: url.pathname })
    logger.warn("read api request failed", { path: url.pathname, status, error: message })
    sendJson(response, status, { error: message })
  } finally {
    metrics.observe("read_api.request_ms", Date.now() - started, { path: url.pathname })
  }
}

function route(url: URL, store: ReadModelStore) {
  const path = url.pathname
  if (path === "/health") return { ok: true }
  if (path === "/v1/protocol/summary") return store.getProtocolSummary()
  if (path === "/v1/vaults") return store.getVaults()
  if (path === "/v1/liquidations") return store.getLiquidationQueue()
  if (path === "/v1/liquidations/history") return store.getEvents("liquidation")
  if (path === "/v1/oracle/history") return store.getEvents("oracle_update")
  if (path === "/v1/events") return store.getEvents()

  const userVaultsMatch = path.match(/^\/v1\/users\/([^/]+)\/vaults$/)
  if (userVaultsMatch?.[1]) return store.getUserVaults(decodeURIComponent(userVaultsMatch[1]))

  const userHistoryMatch = path.match(/^\/v1\/users\/([^/]+)\/history$/)
  if (userHistoryMatch?.[1]) return store.getUserHistory(decodeURIComponent(userHistoryMatch[1]))

  throw new Error("route not found")
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
  })
  response.end(JSON.stringify(serialize(body)))
}
