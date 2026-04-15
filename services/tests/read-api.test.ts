import { afterEach, describe, expect, it } from "vitest"
import type { Server } from "node:http"
import type { AddressInfo } from "node:net"
import { MockChainClient } from "../src/chain/mock-chain"
import { ReadIndexerService } from "../src/read/indexer"
import { ReadModelStore } from "../src/read/store"
import { createReadApiServer } from "../src/read/server"
import { MemoryLogger } from "../src/observability/logger"
import { protocolEvents, protocolState, OWNER } from "./fixtures"

let server: Server | undefined

afterEach(async () => {
  if (!server) return
  await new Promise<void>((resolve) => server?.close(() => resolve()))
  server = undefined
})

async function start(store: ReadModelStore) {
  server = createReadApiServer(store, new MemoryLogger())
  await new Promise<void>((resolve) => server?.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  return `http://127.0.0.1:${port}`
}

describe("read API", () => {
  it("serves protocol summaries, vaults, histories, and oracle history", async () => {
    const store = new ReadModelStore()
    const indexer = new ReadIndexerService(
      new MockChainClient(protocolState(), protocolEvents()),
      store,
      new MemoryLogger()
    )
    await indexer.refresh()
    const baseUrl = await start(store)

    const [summary, vaults, userHistory, liquidationHistory, oracleHistory] = await Promise.all([
      fetch(`${baseUrl}/v1/protocol/summary`).then((response) => response.json()),
      fetch(`${baseUrl}/v1/vaults`).then((response) => response.json()),
      fetch(`${baseUrl}/v1/users/${OWNER}/history`).then((response) => response.json()),
      fetch(`${baseUrl}/v1/liquidations/history`).then((response) => response.json()),
      fetch(`${baseUrl}/v1/oracle/history`).then((response) => response.json()),
    ])

    expect(summary.vaultCount).toBe("2")
    expect(vaults).toHaveLength(2)
    expect(userHistory.events).toHaveLength(1)
    expect(liquidationHistory[0].txId).toBe("TX-LIQ")
    expect(oracleHistory[0].type).toBe("oracle_update")
  })

  it("returns 404 for unknown routes", async () => {
    const store = new ReadModelStore()
    store.replaceSnapshot(protocolState())
    const baseUrl = await start(store)

    const response = await fetch(`${baseUrl}/missing`)

    expect(response.status).toBe(404)
  })
})
