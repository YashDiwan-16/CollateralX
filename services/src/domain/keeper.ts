import { discoverLiquidationCandidates, evaluateVault, isOracleStale } from "./math"
import type { KeeperDecision, KeeperGuardrails, KeeperPlan, ProtocolState, VaultRecord } from "./types"

export function liquidationJobKey(vaultId: bigint, oracleRound: bigint) {
  return `liquidate:${vaultId.toString()}:round:${oracleRound.toString()}`
}

function isAllowedByVaultFilters(vault: VaultRecord, guardrails: KeeperGuardrails) {
  const id = vault.id.toString()
  if (guardrails.blockedVaultIds.has(id)) return false
  if (guardrails.allowedVaultIds && !guardrails.allowedVaultIds.has(id)) return false
  return true
}

export function buildKeeperPlan(
  state: ProtocolState,
  guardrails: KeeperGuardrails,
  nowSeconds = BigInt(Math.floor(Date.now() / 1000))
): KeeperPlan {
  const skipped: KeeperDecision[] = []

  if (guardrails.staleOracleBlocksExecution && isOracleStale(nowSeconds, state.oracle)) {
    return {
      scannedVaults: state.vaults.length,
      candidates: [],
      decisions: [],
      skipped: state.vaults.map((vault) => ({ kind: "skip", vault, reason: "oracle-stale" })),
    }
  }

  const candidates = discoverLiquidationCandidates(state, nowSeconds, guardrails.minLiquidationGapBps)
    .filter((candidate) => {
      if (isAllowedByVaultFilters(candidate.vault, guardrails)) return true
      skipped.push({ kind: "skip", vault: candidate.vault, evaluation: candidate, reason: "vault-filtered" })
      return false
    })

  let liquidationCount = 0
  let debtThisRun = 0n
  const decisions: KeeperDecision[] = []

  for (const candidate of candidates) {
    if (liquidationCount >= guardrails.maxLiquidationsPerRun) {
      skipped.push({ kind: "skip", vault: candidate.vault, evaluation: candidate, reason: "max-liquidations-per-run" })
      continue
    }

    if (debtThisRun + candidate.repayAmountMicroStable > guardrails.maxDebtMicroStablePerRun) {
      skipped.push({ kind: "skip", vault: candidate.vault, evaluation: candidate, reason: "max-debt-per-run" })
      continue
    }

    decisions.push({
      kind: "liquidate",
      candidate,
      jobKey: liquidationJobKey(candidate.vault.id, state.oracle.updatedRound),
    })
    liquidationCount += 1
    debtThisRun += candidate.repayAmountMicroStable
  }

  const liquidatableIds = new Set(candidates.map((candidate) => candidate.vault.id.toString()))
  for (const vault of state.vaults) {
    if (liquidatableIds.has(vault.id.toString())) continue
    const evaluation = evaluateVault(vault, state.params, state.oracle)
    skipped.push({ kind: "skip", vault, evaluation, reason: evaluation.isLiquidatable ? "inside-guard-band" : "healthy" })
  }

  return {
    scannedVaults: state.vaults.length,
    candidates,
    decisions,
    skipped,
  }
}
