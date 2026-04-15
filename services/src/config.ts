import "dotenv/config"
import type { ProtocolNetwork } from "./domain/types"
import type { LogLevel } from "./observability/logger"
import type { RetryPolicy } from "./infra/retry"

export interface ChainConfig {
  network: ProtocolNetwork
  algodServer: string
  algodToken: string
  algodPort?: string
  indexerServer: string
  indexerToken: string
  indexerPort?: string
  protocolAppId?: bigint
  oracleAppId?: bigint
  stablecoinAppId?: bigint
  liquidationAppId?: bigint
  keeperAccountAddress?: string
  keeperMnemonic?: string
  oracleUpdaterAddress?: string
  oracleUpdaterMnemonic?: string
  scanLimit: number
  simulateBeforeSubmit: boolean
  liquidationExtraFeeMicroAlgo: bigint
}

export interface KeeperConfig {
  dryRun: boolean
  executionEnabled: boolean
  intervalMs: number
  maxLiquidationsPerRun: number
  maxDebtMicroStablePerRun: bigint
  minLiquidationGapBps: bigint
  jobStatePath: string
  blockedVaultIds: Set<string>
  allowedVaultIds?: Set<string>
  retry: RetryPolicy
}

export interface OracleConfig {
  dryRun: boolean
  sourceKind: "static" | "http"
  staticPriceMicroUsd?: bigint
  httpUrl?: string
  sourceId: string
  maxDeviationBps: bigint
  retry: RetryPolicy
}

export interface ReadApiConfig {
  port: number
  refreshIntervalMs: number
}

export interface ServiceConfig {
  chain: ChainConfig
  keeper: KeeperConfig
  oracle: OracleConfig
  readApi: ReadApiConfig
  logLevel: LogLevel
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  return {
    chain: {
      network: parseNetwork(env.COLLATERALX_NETWORK),
      algodServer: env.ALGOD_SERVER ?? "http://localhost:4001",
      algodToken: env.ALGOD_TOKEN ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      algodPort: blankToUndefined(env.ALGOD_PORT),
      indexerServer: env.INDEXER_SERVER ?? "http://localhost:8980",
      indexerToken: env.INDEXER_TOKEN ?? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      indexerPort: blankToUndefined(env.INDEXER_PORT),
      protocolAppId: parseOptionalBigInt(env.PROTOCOL_APP_ID),
      oracleAppId: parseOptionalBigInt(env.ORACLE_APP_ID),
      stablecoinAppId: parseOptionalBigInt(env.STABLECOIN_APP_ID),
      liquidationAppId: parseOptionalBigInt(env.LIQUIDATION_APP_ID),
      keeperAccountAddress: blankToUndefined(env.KEEPER_ACCOUNT_ADDRESS),
      keeperMnemonic: blankToUndefined(env.KEEPER_MNEMONIC),
      oracleUpdaterAddress: blankToUndefined(env.ORACLE_UPDATER_ADDRESS),
      oracleUpdaterMnemonic: blankToUndefined(env.ORACLE_UPDATER_MNEMONIC),
      scanLimit: parseInteger(env.KEEPER_SCAN_LIMIT, 500),
      simulateBeforeSubmit: parseBoolean(env.SIMULATE_BEFORE_SUBMIT, true),
      liquidationExtraFeeMicroAlgo: parseBigInt(env.LIQUIDATION_EXTRA_FEE_MICRO_ALGO, 20_000n),
    },
    keeper: {
      dryRun: parseBoolean(env.KEEPER_DRY_RUN, true),
      executionEnabled: parseBoolean(env.KEEPER_EXECUTION_ENABLED, false),
      intervalMs: parseInteger(env.KEEPER_INTERVAL_MS, 30_000),
      maxLiquidationsPerRun: parseInteger(env.KEEPER_MAX_LIQUIDATIONS_PER_RUN, 1),
      maxDebtMicroStablePerRun: parseBigInt(env.KEEPER_MAX_DEBT_PER_RUN_MICRO_STABLE, 100_000n * 1_000_000n),
      minLiquidationGapBps: parseBigInt(env.KEEPER_MIN_LIQUIDATION_GAP_BPS, 25n),
      jobStatePath: env.KEEPER_JOB_STATE_PATH ?? ".collateralx/keeper-jobs.json",
      blockedVaultIds: parseIdSet(env.KEEPER_BLOCKED_VAULT_IDS),
      allowedVaultIds: parseOptionalIdSet(env.KEEPER_ALLOWED_VAULT_IDS),
      retry: retryPolicyFromEnv(env, "KEEPER", { attempts: 3, baseDelayMs: 500, maxDelayMs: 5_000 }),
    },
    oracle: {
      dryRun: parseBoolean(env.ORACLE_DRY_RUN, true),
      sourceKind: env.ORACLE_SOURCE_KIND === "http" ? "http" : "static",
      staticPriceMicroUsd: parseOptionalBigInt(env.ORACLE_STATIC_PRICE_MICRO_USD),
      httpUrl: blankToUndefined(env.ORACLE_HTTP_URL),
      sourceId: env.ORACLE_SOURCE_ID ?? "trusted-updater:v1",
      maxDeviationBps: parseBigInt(env.ORACLE_MAX_DEVIATION_BPS, 2_500n),
      retry: retryPolicyFromEnv(env, "ORACLE", { attempts: 3, baseDelayMs: 500, maxDelayMs: 5_000 }),
    },
    readApi: {
      port: parseInteger(env.READ_API_PORT, 8787),
      refreshIntervalMs: parseInteger(env.READ_REFRESH_INTERVAL_MS, 10_000),
    },
    logLevel: parseLogLevel(env.LOG_LEVEL),
  }
}

function parseNetwork(value?: string): ProtocolNetwork {
  if (value === "testnet" || value === "mainnet" || value === "localnet") return value
  return "localnet"
}

function parseLogLevel(value?: string): LogLevel {
  if (value === "debug" || value === "info" || value === "warn" || value === "error") return value
  return "info"
}

function blankToUndefined(value?: string) {
  return value && value.trim().length > 0 ? value : undefined
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined || value === "") return fallback
  return value === "true" || value === "1" || value === "yes"
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBigInt(value: string | undefined, fallback: bigint) {
  const parsed = parseOptionalBigInt(value)
  return parsed ?? fallback
}

function parseOptionalBigInt(value?: string) {
  if (!value) return undefined
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

function parseIdSet(value?: string) {
  return new Set((value ?? "").split(",").map((entry) => entry.trim()).filter(Boolean))
}

function parseOptionalIdSet(value?: string) {
  const parsed = parseIdSet(value)
  return parsed.size > 0 ? parsed : undefined
}

function retryPolicyFromEnv(env: NodeJS.ProcessEnv, prefix: string, fallback: RetryPolicy): RetryPolicy {
  return {
    attempts: parseInteger(env[`${prefix}_RETRY_ATTEMPTS`], fallback.attempts),
    baseDelayMs: parseInteger(env[`${prefix}_RETRY_BASE_DELAY_MS`], fallback.baseDelayMs),
    maxDelayMs: parseInteger(env[`${prefix}_RETRY_MAX_DELAY_MS`], fallback.maxDelayMs),
  }
}

export function requireAppIds(config: ChainConfig) {
  const missing = [
    ["PROTOCOL_APP_ID", config.protocolAppId],
    ["ORACLE_APP_ID", config.oracleAppId],
    ["STABLECOIN_APP_ID", config.stablecoinAppId],
  ].filter(([, value]) => !value)

  if (missing.length > 0) {
    throw new Error(`Missing required app ids: ${missing.map(([name]) => name).join(", ")}`)
  }
}
