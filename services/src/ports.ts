import type { LiquidationCandidate, ProtocolState, TxSubmission, IndexedEvent, OracleSample } from "./domain/types"

export interface ChainReader {
  loadProtocolState(): Promise<ProtocolState>
  loadIndexedEvents?(): Promise<IndexedEvent[]>
  getCurrentRound?(): Promise<bigint>
  getCurrentTimestamp?(): Promise<bigint>
}

export interface LiquidationExecutor {
  submitLiquidation(candidate: LiquidationCandidate): Promise<TxSubmission>
}

export interface OracleUpdateInput {
  pricePerAlgoMicroUsd: bigint
  updatedAt: bigint
  updatedRound: bigint
  source: string
}

export interface OracleUpdater {
  submitOracleUpdate(input: OracleUpdateInput): Promise<TxSubmission>
}

export interface OraclePriceSource {
  readPrice(currentOracle?: OracleSample): Promise<{
    pricePerAlgoMicroUsd: bigint
    source: string
    updatedAt?: bigint
    updatedRound?: bigint
  }>
}

export type ProtocolChain = ChainReader & Partial<LiquidationExecutor> & Partial<OracleUpdater>
