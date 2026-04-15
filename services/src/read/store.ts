import type { IndexedEvent, ProtocolState } from "../domain/types"
import { evaluatedVaults, liquidationQueue, protocolSummary, userVaultHistory } from "../domain/read-model"

export class ReadModelStore {
  private state?: ProtocolState
  private events: IndexedEvent[] = []
  private oracleRounds = new Set<string>()

  replaceSnapshot(state: ProtocolState, events: IndexedEvent[] = []) {
    this.state = state
    this.events = mergeEvents(this.events, events)
    const roundKey = state.oracle.updatedRound.toString()
    if (!this.oracleRounds.has(roundKey)) {
      this.oracleRounds.add(roundKey)
      this.events = mergeEvents(this.events, [
        {
          id: `oracle:${roundKey}`,
          type: "oracle_update",
          timestamp: state.loadedAt,
          round: state.oracle.updatedRound,
          actor: state.oracle.updater,
          metadata: {
            pricePerAlgoMicroUsd: state.oracle.pricePerAlgoMicroUsd,
            source: state.oracle.source,
          },
        },
      ])
    }
  }

  getSnapshot() {
    return this.state
  }

  getProtocolSummary() {
    return this.requireState(protocolSummary)
  }

  getVaults() {
    return this.requireState(evaluatedVaults)
  }

  getUserVaults(owner: string) {
    return this.getVaults().filter((vault) => vault.vault.owner === owner)
  }

  getLiquidationQueue() {
    return this.requireState(liquidationQueue)
  }

  getEvents(type?: string) {
    return type ? this.events.filter((event) => event.type === type) : this.events
  }

  getUserHistory(owner: string) {
    return userVaultHistory(owner, this.events)
  }

  recordEvent(event: IndexedEvent) {
    this.events = mergeEvents(this.events, [event])
  }

  private requireState<T>(selector: (state: ProtocolState) => T) {
    if (!this.state) throw new Error("read model has not been indexed yet")
    return selector(this.state)
  }
}

function mergeEvents(existing: IndexedEvent[], incoming: IndexedEvent[]) {
  const byId = new Map(existing.map((event) => [event.id, event]))
  for (const event of incoming) byId.set(event.id, event)
  return [...byId.values()].sort((left, right) => right.timestamp - left.timestamp)
}
