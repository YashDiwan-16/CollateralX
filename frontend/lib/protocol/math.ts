import { BPS_DENOMINATOR, MICRO_ALGO, MICRO_STABLE } from "@/lib/protocol/constants"
import type { HealthState, ProtocolParamsView, VaultView } from "@/lib/protocol/types"

export function ceilDiv(left: bigint, right: bigint) {
  if (right <= 0n) throw new Error("division by zero")
  return left === 0n ? 0n : (left + right - 1n) / right
}

export function decimalToMicro(value: string, decimals = 6): bigint {
  const normalized = value.trim()
  if (!/^\d+(\.\d*)?$/.test(normalized)) return 0n

  const [whole, fraction = ""] = normalized.split(".")
  const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals)
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0")
}

export function microToDecimal(value: bigint, decimals = 6, maxFractionDigits = 2) {
  const negative = value < 0n
  const abs = negative ? -value : value
  const scale = 10n ** BigInt(decimals)
  const whole = abs / scale
  const fraction = abs % scale
  const trimmedFraction = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, maxFractionDigits)
    .replace(/0+$/, "")

  return `${negative ? "-" : ""}${whole.toLocaleString("en-US")}${trimmedFraction ? `.${trimmedFraction}` : ""}`
}

export function formatAlgo(value: bigint, maxFractionDigits = 2) {
  return `${microToDecimal(value, 6, maxFractionDigits)} ALGO`
}

export function formatStable(value: bigint, maxFractionDigits = 2) {
  return `${microToDecimal(value, 6, maxFractionDigits)} algoUSD`
}

export function formatUsd(value: bigint, maxFractionDigits = 2) {
  return `$${microToDecimal(value, 6, maxFractionDigits)}`
}

export function formatBps(value: bigint | null, fallback = "No debt") {
  if (value === null) return fallback
  const whole = value / 100n
  const fraction = value % 100n
  return `${whole.toLocaleString("en-US")}${fraction > 0n ? `.${fraction.toString().padStart(2, "0").replace(/0+$/, "")}` : ""}%`
}

export function formatAddressShort(address?: string) {
  if (!address) return "Not configured"
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatUnixTimestampUtc(seconds: bigint) {
  const date = new Date(Number(seconds) * 1000)
  const pad = (value: number) => value.toString().padStart(2, "0")
  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`,
  ].join(" ")
}

export function collateralValueMicroStable(collateralMicroAlgo: bigint, pricePerAlgoMicroUsd: bigint) {
  return (collateralMicroAlgo * pricePerAlgoMicroUsd) / MICRO_ALGO
}

export function collateralRatioBps(
  collateralMicroAlgo: bigint,
  debtMicroStable: bigint,
  pricePerAlgoMicroUsd: bigint
): bigint | null {
  if (debtMicroStable === 0n) return null
  return (collateralValueMicroStable(collateralMicroAlgo, pricePerAlgoMicroUsd) * BPS_DENOMINATOR) / debtMicroStable
}

export function liquidationPriceMicroUsd(
  debtMicroStable: bigint,
  collateralMicroAlgo: bigint,
  liquidationRatioBps: bigint
): bigint | null {
  if (debtMicroStable === 0n || collateralMicroAlgo === 0n) return null
  return ceilDiv(debtMicroStable * MICRO_ALGO * liquidationRatioBps, collateralMicroAlgo * BPS_DENOMINATOR)
}

export function maxSafeDebtMicroStable(
  collateralMicroAlgo: bigint,
  pricePerAlgoMicroUsd: bigint,
  minCollateralRatioBps: bigint
) {
  return (collateralValueMicroStable(collateralMicroAlgo, pricePerAlgoMicroUsd) * BPS_DENOMINATOR) / minCollateralRatioBps
}

export function maxMintableMicroStable(args: {
  collateralMicroAlgo: bigint
  debtMicroStable: bigint
  pricePerAlgoMicroUsd: bigint
  minCollateralRatioBps: bigint
  vaultMintCapMicroStable: bigint
  protocolDebtCeilingMicroStable: bigint
  totalDebtMicroStable: bigint
}) {
  const maxByHealth = maxSafeDebtMicroStable(
    args.collateralMicroAlgo,
    args.pricePerAlgoMicroUsd,
    args.minCollateralRatioBps
  )
  const healthRemaining = maxByHealth > args.debtMicroStable ? maxByHealth - args.debtMicroStable : 0n
  const vaultRemaining =
    args.vaultMintCapMicroStable > args.debtMicroStable ? args.vaultMintCapMicroStable - args.debtMicroStable : 0n
  const protocolRemaining =
    args.protocolDebtCeilingMicroStable > args.totalDebtMicroStable
      ? args.protocolDebtCeilingMicroStable - args.totalDebtMicroStable
      : 0n

  return [healthRemaining, vaultRemaining, protocolRemaining].reduce((min, next) => (next < min ? next : min))
}

export function maxWithdrawableMicroAlgo(args: {
  collateralMicroAlgo: bigint
  debtMicroStable: bigint
  pricePerAlgoMicroUsd: bigint
  minCollateralRatioBps: bigint
}) {
  if (args.debtMicroStable === 0n) return args.collateralMicroAlgo
  if (args.pricePerAlgoMicroUsd === 0n) return 0n

  const requiredCollateral = ceilDiv(
    args.debtMicroStable * args.minCollateralRatioBps * MICRO_ALGO,
    args.pricePerAlgoMicroUsd * BPS_DENOMINATOR
  )
  return args.collateralMicroAlgo > requiredCollateral ? args.collateralMicroAlgo - requiredCollateral : 0n
}

export function healthState(
  ratioBps: bigint | null,
  minCollateralRatioBps: bigint,
  liquidationRatioBps: bigint,
  isClosed = false
): HealthState {
  if (isClosed) return "closed"
  if (ratioBps === null) return "safe"
  if (ratioBps <= liquidationRatioBps) return "liquidatable"
  if (ratioBps < minCollateralRatioBps) return "danger"
  if (ratioBps < minCollateralRatioBps + 3_000n) return "warn"
  return "safe"
}

export function isOracleStale(nowSeconds: bigint, updatedAt: bigint, maxAgeSeconds: bigint, adapterFresh: boolean) {
  if (!adapterFresh || updatedAt === 0n || maxAgeSeconds === 0n) return true
  if (updatedAt > nowSeconds) return true
  return nowSeconds - updatedAt > maxAgeSeconds
}

export function enrichVault(args: {
  id: bigint
  owner: string
  collateralMicroAlgo: bigint
  debtMicroStable: bigint
  createdAt: bigint
  updatedAt: bigint
  version: bigint
  params: ProtocolParamsView
  pricePerAlgoMicroUsd: bigint
  totalDebtMicroStable: bigint
}) {
  const ratio = collateralRatioBps(args.collateralMicroAlgo, args.debtMicroStable, args.pricePerAlgoMicroUsd)
  const health = healthState(ratio, args.params.minCollateralRatioBps, args.params.liquidationRatioBps)
  const displayId = args.id.toString().padStart(4, "0")

  return {
    id: args.id,
    displayId,
    owner: args.owner,
    collateralMicroAlgo: args.collateralMicroAlgo,
    debtMicroStable: args.debtMicroStable,
    collateralValueMicroStable: collateralValueMicroStable(args.collateralMicroAlgo, args.pricePerAlgoMicroUsd),
    collateralRatioBps: ratio,
    liquidationPriceMicroUsd: liquidationPriceMicroUsd(
      args.debtMicroStable,
      args.collateralMicroAlgo,
      args.params.liquidationRatioBps
    ),
    maxMintableMicroStable: maxMintableMicroStable({
      collateralMicroAlgo: args.collateralMicroAlgo,
      debtMicroStable: args.debtMicroStable,
      pricePerAlgoMicroUsd: args.pricePerAlgoMicroUsd,
      minCollateralRatioBps: args.params.minCollateralRatioBps,
      vaultMintCapMicroStable: args.params.vaultMintCapMicroStable,
      protocolDebtCeilingMicroStable: args.params.protocolDebtCeilingMicroStable,
      totalDebtMicroStable: args.totalDebtMicroStable,
    }),
    maxWithdrawableMicroAlgo: maxWithdrawableMicroAlgo({
      collateralMicroAlgo: args.collateralMicroAlgo,
      debtMicroStable: args.debtMicroStable,
      pricePerAlgoMicroUsd: args.pricePerAlgoMicroUsd,
      minCollateralRatioBps: args.params.minCollateralRatioBps,
    }),
    health,
    isLiquidatable: health === "liquidatable",
    createdAt: args.createdAt,
    updatedAt: args.updatedAt,
    version: args.version,
  } satisfies VaultView
}

export function projectVaultAction(
  vault: VaultView,
  action: "deposit" | "mint" | "repay" | "withdraw",
  amount: bigint,
  params: ProtocolParamsView,
  pricePerAlgoMicroUsd: bigint,
  totalDebtMicroStable: bigint
) {
  const next = {
    collateralMicroAlgo: vault.collateralMicroAlgo,
    debtMicroStable: vault.debtMicroStable,
  }

  if (action === "deposit") next.collateralMicroAlgo += amount
  if (action === "mint") next.debtMicroStable += amount
  if (action === "repay") next.debtMicroStable = amount >= next.debtMicroStable ? 0n : next.debtMicroStable - amount
  if (action === "withdraw") next.collateralMicroAlgo = amount >= next.collateralMicroAlgo ? 0n : next.collateralMicroAlgo - amount

  return enrichVault({
    id: vault.id,
    owner: vault.owner,
    collateralMicroAlgo: next.collateralMicroAlgo,
    debtMicroStable: next.debtMicroStable,
    createdAt: vault.createdAt,
    updatedAt: BigInt(Math.floor(Date.now() / 1000)),
    version: vault.version,
    params,
    pricePerAlgoMicroUsd,
    totalDebtMicroStable:
      totalDebtMicroStable - vault.debtMicroStable + next.debtMicroStable,
  })
}

export function liquidationRewardMicroStable(vault: VaultView, liquidationBonusBps: bigint) {
  if (!vault.isLiquidatable || vault.debtMicroStable === 0n) return 0n
  return (vault.debtMicroStable * liquidationBonusBps) / BPS_DENOMINATOR
}

export function healthFactorLabel(vault: VaultView, params: ProtocolParamsView) {
  if (vault.collateralRatioBps === null) return "No debt"
  const scaled = (vault.collateralRatioBps * 100n) / params.liquidationRatioBps
  return `${scaled / 100n}.${(scaled % 100n).toString().padStart(2, "0")}`
}

export function stableToAlgoAtOracle(microStable: bigint, pricePerAlgoMicroUsd: bigint) {
  if (pricePerAlgoMicroUsd === 0n) return 0n
  return (microStable * MICRO_ALGO) / pricePerAlgoMicroUsd
}

export function minimumDebtFloorText(minDebtFloorMicroStable: bigint) {
  return minDebtFloorMicroStable === 0n ? "None" : formatStable(minDebtFloorMicroStable)
}

export function oneAlgoPriceMicroUsd() {
  return MICRO_STABLE
}
