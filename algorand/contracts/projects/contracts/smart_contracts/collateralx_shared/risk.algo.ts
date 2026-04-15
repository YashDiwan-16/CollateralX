import {
  BigUint,
  Bytes,
  Uint64,
  assert,
  op,
  type biguint,
  type uint64,
} from '@algorandfoundation/algorand-typescript'

export const MICRO_UNIT: uint64 = Uint64(1_000_000)
export const BPS_DENOMINATOR: uint64 = Uint64(10_000)

function bigToUint64(value: biguint): uint64 {
  assert(value <= BigUint(Uint64.MAX_VALUE), 'uint64 overflow')
  return op.btoi(Bytes(value))
}

export function safeAdd(left: uint64, right: uint64): uint64 {
  return bigToUint64(BigUint(left) + BigUint(right))
}

export function collateralValueMicroStable(collateralMicroAlgo: uint64, pricePerAlgoMicroStable: uint64): uint64 {
  assert(pricePerAlgoMicroStable > Uint64(0), 'oracle price required')
  return bigToUint64((BigUint(collateralMicroAlgo) * BigUint(pricePerAlgoMicroStable)) / BigUint(MICRO_UNIT))
}

export function maxDebtForCollateral(
  collateralMicroAlgo: uint64,
  pricePerAlgoMicroStable: uint64,
  minCollateralRatioBps: uint64
): uint64 {
  assert(minCollateralRatioBps >= BPS_DENOMINATOR, 'min ratio too low')
  const collateralValue = BigUint(collateralValueMicroStable(collateralMicroAlgo, pricePerAlgoMicroStable))
  return bigToUint64((collateralValue * BigUint(BPS_DENOMINATOR)) / BigUint(minCollateralRatioBps))
}

export function isHealthyDebt(
  collateralMicroAlgo: uint64,
  debtMicroStable: uint64,
  pricePerAlgoMicroStable: uint64,
  minCollateralRatioBps: uint64
): boolean {
  assert(pricePerAlgoMicroStable > Uint64(0), 'oracle price required')
  assert(minCollateralRatioBps >= BPS_DENOMINATOR, 'min ratio too low')
  const left: biguint = BigUint(collateralMicroAlgo) * BigUint(pricePerAlgoMicroStable) * BigUint(BPS_DENOMINATOR)
  const right: biguint = BigUint(debtMicroStable) * BigUint(MICRO_UNIT) * BigUint(minCollateralRatioBps)
  return left >= right
}

export function remainingCapacity(cap: uint64, used: uint64): uint64 {
  if (used >= cap) {
    return Uint64(0)
  }
  return cap - used
}

export function minUint64(left: uint64, right: uint64): uint64 {
  if (left <= right) {
    return left
  }
  return right
}

export function availableToMintMicroStable(
  collateralMicroAlgo: uint64,
  existingDebtMicroStable: uint64,
  pricePerAlgoMicroStable: uint64,
  minCollateralRatioBps: uint64,
  vaultMintCapMicroStable: uint64,
  totalDebtMicroStable: uint64,
  protocolDebtCeilingMicroStable: uint64,
  issuedSupplyMicroStable: uint64,
  supplyCeilingMicroStable: uint64
): uint64 {
  const collateralCapacity = remainingCapacity(
    maxDebtForCollateral(collateralMicroAlgo, pricePerAlgoMicroStable, minCollateralRatioBps),
    existingDebtMicroStable
  )
  const vaultCapacity = remainingCapacity(vaultMintCapMicroStable, existingDebtMicroStable)
  const protocolCapacity = remainingCapacity(protocolDebtCeilingMicroStable, totalDebtMicroStable)
  const stablecoinCapacity = remainingCapacity(supplyCeilingMicroStable, issuedSupplyMicroStable)

  return minUint64(minUint64(collateralCapacity, vaultCapacity), minUint64(protocolCapacity, stablecoinCapacity))
}
