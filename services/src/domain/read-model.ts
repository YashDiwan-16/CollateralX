import { collateralValueMicroStable, evaluateVault, liquidationCandidateFromEvaluation } from "./math"
import type {
  IndexedEvent,
  ProtocolState,
  ProtocolSummaryReadModel,
  UserVaultHistory,
  VaultEvaluation,
} from "./types"

export function protocolSummary(state: ProtocolState): ProtocolSummaryReadModel {
  const vaultEvaluations = state.vaults.map((vault) => evaluateVault(vault, state.params, state.oracle))
  const tvlMicroUsd = collateralValueMicroStable(
    state.status.totalCollateralMicroAlgo,
    state.oracle.pricePerAlgoMicroUsd
  )
  const liquidatableVaultCount = BigInt(vaultEvaluations.filter((vault) => vault.isLiquidatable).length)
  const atRiskVaultCount = BigInt(vaultEvaluations.filter((vault) => vault.health === "warn" || vault.health === "danger").length)

  return {
    tvlMicroUsd,
    totalDebtMicroStable: state.status.totalDebtMicroStable,
    totalCollateralMicroAlgo: state.status.totalCollateralMicroAlgo,
    vaultCount: state.status.vaultCount,
    liquidatableVaultCount,
    atRiskVaultCount,
    systemCollateralRatioBps:
      state.status.totalDebtMicroStable === 0n
        ? null
        : (tvlMicroUsd * 10_000n) / state.status.totalDebtMicroStable,
    oracleUpdatedRound: state.oracle.updatedRound,
    loadedAt: state.loadedAt,
  }
}

export function evaluatedVaults(state: ProtocolState): VaultEvaluation[] {
  return state.vaults.map((vault) => evaluateVault(vault, state.params, state.oracle))
}

export function liquidationQueue(state: ProtocolState) {
  return evaluatedVaults(state)
    .map((evaluation) => liquidationCandidateFromEvaluation(evaluation, state.params, 0n))
    .filter((candidate) => candidate !== null)
}

export function userVaultHistory(owner: string, events: IndexedEvent[]): UserVaultHistory {
  return {
    owner,
    events: events.filter((event) => event.vaultId !== undefined && (event.owner === owner || event.actor === owner)),
  }
}
