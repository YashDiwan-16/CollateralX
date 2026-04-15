import type {
  LiquidationCandidate,
  OracleSample,
  ProtocolParams,
  ProtocolState,
  VaultEvaluation,
  VaultHealthState,
  VaultRecord,
} from "./types"

export const MICRO_ALGO = 1_000_000n
export const MICRO_STABLE = 1_000_000n
export const BPS_DENOMINATOR = 10_000n

export function ceilDiv(left: bigint, right: bigint) {
  if (right <= 0n) throw new Error("division by zero")
  return left === 0n ? 0n : (left + right - 1n) / right
}

export function collateralValueMicroStable(collateralMicroAlgo: bigint, pricePerAlgoMicroUsd: bigint) {
  return (collateralMicroAlgo * pricePerAlgoMicroUsd) / MICRO_ALGO
}

export function collateralRatioBps(
  collateralMicroAlgo: bigint,
  debtMicroStable: bigint,
  pricePerAlgoMicroUsd: bigint
) {
  if (debtMicroStable === 0n) return null
  return (collateralValueMicroStable(collateralMicroAlgo, pricePerAlgoMicroUsd) * BPS_DENOMINATOR) / debtMicroStable
}

export function liquidationPriceMicroUsd(
  debtMicroStable: bigint,
  collateralMicroAlgo: bigint,
  liquidationRatioBps: bigint
) {
  if (debtMicroStable === 0n || collateralMicroAlgo === 0n) return null
  return ceilDiv(debtMicroStable * MICRO_ALGO * liquidationRatioBps, collateralMicroAlgo * BPS_DENOMINATOR)
}

export function healthState(
  ratioBps: bigint | null,
  minCollateralRatioBps: bigint,
  liquidationRatioBps: bigint,
  isClosed = false
): VaultHealthState {
  if (isClosed) return "closed"
  if (ratioBps === null) return "safe"
  if (ratioBps <= liquidationRatioBps) return "liquidatable"
  if (ratioBps < minCollateralRatioBps) return "danger"
  if (ratioBps < minCollateralRatioBps + 3_000n) return "warn"
  return "safe"
}

export function isOracleStale(nowSeconds: bigint, oracle: OracleSample) {
  if (!oracle.isFresh || oracle.updatedAt === 0n || oracle.maxAgeSeconds === 0n) return true
  if (oracle.updatedAt > nowSeconds) return true
  return nowSeconds - oracle.updatedAt > oracle.maxAgeSeconds
}

export function evaluateVault(vault: VaultRecord, params: ProtocolParams, oracle: OracleSample): VaultEvaluation {
  const ratio = collateralRatioBps(vault.collateralMicroAlgo, vault.debtMicroStable, oracle.pricePerAlgoMicroUsd)
  const health = healthState(ratio, params.minCollateralRatioBps, params.liquidationRatioBps, vault.status === 0n)

  return {
    vault,
    collateralValueMicroStable: collateralValueMicroStable(vault.collateralMicroAlgo, oracle.pricePerAlgoMicroUsd),
    collateralRatioBps: ratio,
    liquidationPriceMicroUsd: liquidationPriceMicroUsd(
      vault.debtMicroStable,
      vault.collateralMicroAlgo,
      params.liquidationRatioBps
    ),
    health,
    isLiquidatable: health === "liquidatable",
  }
}

export function liquidationCandidateFromEvaluation(
  evaluation: VaultEvaluation,
  params: ProtocolParams,
  minLiquidationGapBps = 0n
): LiquidationCandidate | null {
  const ratio = evaluation.collateralRatioBps
  if (ratio === null) return null
  if (evaluation.vault.debtMicroStable <= 0n) return null
  if (evaluation.vault.status === 0n) return null
  if (ratio > params.liquidationRatioBps) return null

  const requiredRatio = params.liquidationRatioBps > minLiquidationGapBps
    ? params.liquidationRatioBps - minLiquidationGapBps
    : params.liquidationRatioBps
  if (ratio > requiredRatio) return null

  return {
    ...evaluation,
    reason: ratio === params.liquidationRatioBps ? "at-threshold" : "below-threshold",
    repayAmountMicroStable: evaluation.vault.debtMicroStable,
    estimatedCollateralValueMicroStable: evaluation.collateralValueMicroStable,
  }
}

export function discoverLiquidationCandidates(
  state: ProtocolState,
  nowSeconds = BigInt(Math.floor(Date.now() / 1000)),
  minLiquidationGapBps = 0n
) {
  if (isOracleStale(nowSeconds, state.oracle)) return []

  return state.vaults
    .map((vault) => evaluateVault(vault, state.params, state.oracle))
    .map((evaluation) => liquidationCandidateFromEvaluation(evaluation, state.params, minLiquidationGapBps))
    .filter((candidate): candidate is LiquidationCandidate => candidate !== null)
    .sort((left, right) => {
      const leftRatio = left.collateralRatioBps ?? 0n
      const rightRatio = right.collateralRatioBps ?? 0n
      if (leftRatio !== rightRatio) return leftRatio < rightRatio ? -1 : 1
      return left.repayAmountMicroStable > right.repayAmountMicroStable ? -1 : 1
    })
}
