import type { ChainReader, LiquidationExecutor, OracleUpdateInput, OracleUpdater } from "../ports"
import type { IndexedEvent, LiquidationCandidate, ProtocolState, TxSubmission } from "../domain/types"

export class MockChainClient implements ChainReader, LiquidationExecutor, OracleUpdater {
  readonly liquidations: LiquidationCandidate[] = []
  readonly oracleUpdates: OracleUpdateInput[] = []
  failLiquidations = 0
  failOracleUpdates = 0

  constructor(
    private state: ProtocolState,
    private readonly events: IndexedEvent[] = []
  ) {}

  async loadProtocolState() {
    return this.state
  }

  async loadIndexedEvents() {
    return this.events
  }

  async getCurrentRound() {
    return this.state.oracle.updatedRound + 1n
  }

  async getCurrentTimestamp() {
    return BigInt(Math.floor(Date.now() / 1000))
  }

  async submitLiquidation(candidate: LiquidationCandidate): Promise<TxSubmission> {
    if (this.failLiquidations > 0) {
      this.failLiquidations -= 1
      throw new Error("mock liquidation failure")
    }
    this.liquidations.push(candidate)
    this.state = {
      ...this.state,
      vaults: this.state.vaults.filter((vault) => vault.id !== candidate.vault.id),
      status: {
        ...this.state.status,
        vaultCount: this.state.status.vaultCount - 1n,
        totalDebtMicroStable: this.state.status.totalDebtMicroStable - candidate.vault.debtMicroStable,
        totalCollateralMicroAlgo: this.state.status.totalCollateralMicroAlgo - candidate.vault.collateralMicroAlgo,
      },
    }
    return { txId: `mock-liquidation-${candidate.vault.id.toString()}`, simulated: true }
  }

  async submitOracleUpdate(input: OracleUpdateInput): Promise<TxSubmission> {
    if (this.failOracleUpdates > 0) {
      this.failOracleUpdates -= 1
      throw new Error("mock oracle update failure")
    }
    this.oracleUpdates.push(input)
    this.state = {
      ...this.state,
      oracle: {
        ...this.state.oracle,
        ...input,
        isFresh: true,
      },
    }
    return { txId: `mock-oracle-${input.updatedRound.toString()}`, simulated: true }
  }
}
