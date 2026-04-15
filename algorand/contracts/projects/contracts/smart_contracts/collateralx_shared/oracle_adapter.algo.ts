import {
  Application,
  Bytes,
  Global,
  Uint64,
  assert,
  op,
  type uint64,
} from '@algorandfoundation/algorand-typescript'

export const ORACLE_PRICE_KEY = 'px'
export const ORACLE_UPDATED_AT_KEY = 'upd'
export const ORACLE_UPDATED_ROUND_KEY = 'urnd'
export const ORACLE_MAX_AGE_KEY = 'maxa'
export const ORACLE_PAUSE_FLAGS_KEY = 'pflg'

export const ORACLE_PAUSE_UPDATES: uint64 = Uint64(1)
export const ORACLE_PAUSE_READS: uint64 = Uint64(2)

export type OracleAdapterSnapshot = {
  pricePerAlgoMicroStable: uint64
  updatedAt: uint64
  updatedRound: uint64
  maxAgeSeconds: uint64
  pauseFlags: uint64
}

/**
 * Canonical protocol-facing oracle adapter interface.
 *
 * The protocol manager intentionally reads the adapter's global state through
 * this helper instead of duplicating key names or freshness rules inside vault
 * actions. A future provider app can be swapped in as long as it preserves this
 * global-state interface or the helper is upgraded in one place.
 */
export function readFreshOracleAdapter(
  oracleApp: Application,
  protocolFreshnessWindowSeconds: uint64
): OracleAdapterSnapshot {
  const [price, priceExists] = op.AppGlobal.getExUint64(oracleApp, Bytes(ORACLE_PRICE_KEY))
  const [updatedAt, updatedAtExists] = op.AppGlobal.getExUint64(oracleApp, Bytes(ORACLE_UPDATED_AT_KEY))
  const [updatedRound, updatedRoundExists] = op.AppGlobal.getExUint64(oracleApp, Bytes(ORACLE_UPDATED_ROUND_KEY))
  const [maxAgeSeconds, maxAgeExists] = op.AppGlobal.getExUint64(oracleApp, Bytes(ORACLE_MAX_AGE_KEY))
  const [pauseFlags, pauseFlagsExist] = op.AppGlobal.getExUint64(oracleApp, Bytes(ORACLE_PAUSE_FLAGS_KEY))

  assert(priceExists, 'oracle price missing')
  assert(updatedAtExists, 'oracle timestamp missing')
  assert(updatedRoundExists, 'oracle round missing')
  assert(maxAgeExists, 'oracle max age missing')
  assert(pauseFlagsExist, 'oracle pause missing')
  assertFreshOracleValues(price, updatedAt, updatedRound, maxAgeSeconds, pauseFlags, protocolFreshnessWindowSeconds)

  return {
    pricePerAlgoMicroStable: price,
    updatedAt,
    updatedRound,
    maxAgeSeconds,
    pauseFlags,
  }
}

export function assertFreshOracleValues(
  pricePerAlgoMicroStable: uint64,
  updatedAt: uint64,
  updatedRound: uint64,
  maxAgeSeconds: uint64,
  pauseFlags: uint64,
  protocolFreshnessWindowSeconds: uint64
): void {
  assert(pricePerAlgoMicroStable > Uint64(0), 'oracle price required')
  assert(updatedAt > Uint64(0), 'oracle timestamp required')
  assert(updatedRound > Uint64(0), 'oracle round required')
  assert(maxAgeSeconds > Uint64(0), 'oracle max age required')
  assert((pauseFlags & ORACLE_PAUSE_READS) === Uint64(0), 'oracle reads paused')
  assert(updatedAt <= Global.latestTimestamp, 'oracle timestamp future')
  assert(updatedRound <= Global.round, 'oracle round future')

  const oracleAge: uint64 = Global.latestTimestamp - updatedAt
  assert(oracleAge <= protocolFreshnessWindowSeconds, 'oracle stale')
  assert(oracleAge <= maxAgeSeconds, 'oracle stale')
}
