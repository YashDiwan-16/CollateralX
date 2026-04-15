import {
  Account,
  Contract,
  Global,
  GlobalState,
  Txn,
  Uint64,
  assert,
  emit,
  readonly,
  type bytes,
  type uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod } from '@algorandfoundation/algorand-typescript/arc4'
import {
  ORACLE_PAUSE_READS,
  ORACLE_PAUSE_UPDATES,
  assertFreshOracleValues,
} from '../collateralx_shared/oracle_adapter.algo'

const MAX_SOURCE_BYTES: uint64 = Uint64(64)

export type OracleSample = {
  updater: Account
  pricePerAlgoMicroUsd: uint64
  updatedAt: uint64
  updatedRound: uint64
  source: bytes
  maxAgeSeconds: uint64
  pauseFlags: uint64
  isFresh: boolean
}

type OracleInitializedEvent = {
  admin: Account
  updater: Account
  pricePerAlgoMicroUsd: uint64
  updatedAt: uint64
  updatedRound: uint64
}

type OracleUpdatedEvent = {
  updater: Account
  pricePerAlgoMicroUsd: uint64
  updatedAt: uint64
  updatedRound: uint64
}

type OracleUpdaterChangedEvent = {
  admin: Account
  oldUpdater: Account
  newUpdater: Account
}

/**
 * Oracle adapter for the v1 trusted-updater price feed.
 *
 * Safety-critical assumption: v1 trusts a single updater account selected by
 * governance. The adapter enforces freshness, monotonic round updates, source
 * tagging, and pause-based circuit breakers. It does not verify an external
 * decentralized feed proof yet.
 */
export class CollateralXOracleAdapter extends Contract {
  admin = GlobalState<Account>({ key: 'adm' })
  updater = GlobalState<Account>({ key: 'updr' })
  initialized = GlobalState<uint64>({ key: 'init', initialValue: Uint64(0) })
  pricePerAlgoMicroUsd = GlobalState<uint64>({ key: 'px', initialValue: Uint64(0) })
  updatedAt = GlobalState<uint64>({ key: 'upd', initialValue: Uint64(0) })
  updatedRound = GlobalState<uint64>({ key: 'urnd', initialValue: Uint64(0) })
  source = GlobalState<bytes>({ key: 'src' })
  maxAgeSeconds = GlobalState<uint64>({ key: 'maxa', initialValue: Uint64(0) })
  pauseFlags = GlobalState<uint64>({ key: 'pflg', initialValue: Uint64(0) })

  @abimethod({ onCreate: 'require' })
  public createApplication(admin: Account): void {
    assert(admin !== Global.zeroAddress, 'admin required')
    this.admin.value = admin
    this.updater.value = admin
    emit('OracleAdminCreated', admin)
  }

  /** One-time adapter initialization by admin. */
  public initializeOracle(
    pricePerAlgoMicroUsd: uint64,
    updatedAt: uint64,
    updatedRound: uint64,
    maxAgeSeconds: uint64,
    source: bytes
  ): void {
    this.assertAdmin()
    assert(this.initialized.value === Uint64(0), 'already initialized')
    this.validateSample(pricePerAlgoMicroUsd, updatedAt, updatedRound, maxAgeSeconds, source)
    this.pricePerAlgoMicroUsd.value = pricePerAlgoMicroUsd
    this.updatedAt.value = updatedAt
    this.updatedRound.value = updatedRound
    this.maxAgeSeconds.value = maxAgeSeconds
    this.source.value = source
    this.initialized.value = Uint64(1)
    emit<OracleInitializedEvent>({
      admin: Txn.sender,
      updater: this.updater.value,
      pricePerAlgoMicroUsd,
      updatedAt,
      updatedRound,
    })
  }

  /** Read the latest stored sample, including whether it is fresh right now. */
  @readonly
  public readOraclePrice(): OracleSample {
    this.assertReady()
    this.assertNotPaused(ORACLE_PAUSE_READS)
    this.assertStoredSampleValid()
    return {
      updater: this.updater.value,
      pricePerAlgoMicroUsd: this.pricePerAlgoMicroUsd.value,
      updatedAt: this.updatedAt.value,
      updatedRound: this.updatedRound.value,
      source: this.source.value,
      maxAgeSeconds: this.maxAgeSeconds.value,
      pauseFlags: this.pauseFlags.value,
      isFresh: this.isCurrentSampleFresh(),
    }
  }

  /** Read the latest sample and reject if the adapter-level freshness window fails. */
  @readonly
  public readFreshOraclePrice(): OracleSample {
    this.assertReady()
    this.assertFresh()
    return {
      updater: this.updater.value,
      pricePerAlgoMicroUsd: this.pricePerAlgoMicroUsd.value,
      updatedAt: this.updatedAt.value,
      updatedRound: this.updatedRound.value,
      source: this.source.value,
      maxAgeSeconds: this.maxAgeSeconds.value,
      pauseFlags: this.pauseFlags.value,
      isFresh: true,
    }
  }

  /** Trusted-updater price update. Governance controls the updater account. */
  public updatePrice(pricePerAlgoMicroUsd: uint64, updatedAt: uint64, updatedRound: uint64, source: bytes): void {
    this.assertReady()
    this.assertUpdater()
    this.assertNotPaused(ORACLE_PAUSE_UPDATES)
    this.validateSample(pricePerAlgoMicroUsd, updatedAt, updatedRound, this.maxAgeSeconds.value, source)
    assert(updatedRound > this.updatedRound.value, 'round not newer')
    assert(updatedAt >= this.updatedAt.value, 'timestamp regressed')
    this.pricePerAlgoMicroUsd.value = pricePerAlgoMicroUsd
    this.updatedAt.value = updatedAt
    this.updatedRound.value = updatedRound
    this.source.value = source
    emit<OracleUpdatedEvent>({ updater: Txn.sender, pricePerAlgoMicroUsd, updatedAt, updatedRound })
  }

  /** Admin-only adapter configuration update. */
  public adminSetOracleConfig(maxAgeSeconds: uint64): void {
    this.assertReady()
    this.assertAdmin()
    assert(maxAgeSeconds > Uint64(0), 'max age required')
    this.maxAgeSeconds.value = maxAgeSeconds
    emit('OracleConfigUpdated', Txn.sender, maxAgeSeconds)
  }

  /** Admin-only updater rotation. */
  public adminSetUpdater(newUpdater: Account): void {
    this.assertReady()
    this.assertAdmin()
    assert(newUpdater !== Global.zeroAddress, 'updater required')
    const oldUpdater = this.updater.value
    this.updater.value = newUpdater
    emit<OracleUpdaterChangedEvent>({ admin: Txn.sender, oldUpdater, newUpdater })
  }

  /** Admin-only replacement of oracle pause flags. */
  public adminSetPauseFlags(pauseFlags: uint64): void {
    this.assertReady()
    this.assertAdmin()
    this.pauseFlags.value = pauseFlags
    emit('OraclePauseFlagsUpdated', Txn.sender, pauseFlags)
  }

  private assertReady(): void {
    assert(this.initialized.value === Uint64(1), 'oracle not initialized')
  }

  private assertAdmin(): void {
    assert(Txn.sender === this.admin.value, 'admin only')
  }

  private assertUpdater(): void {
    assert(Txn.sender === this.updater.value, 'updater only')
  }

  private assertNotPaused(flag: uint64): void {
    const active: uint64 = this.pauseFlags.value & flag
    assert(active === Uint64(0), 'oracle paused')
  }

  private assertFresh(): void {
    assertFreshOracleValues(
      this.pricePerAlgoMicroUsd.value,
      this.updatedAt.value,
      this.updatedRound.value,
      this.maxAgeSeconds.value,
      this.pauseFlags.value,
      this.maxAgeSeconds.value
    )
  }

  private assertStoredSampleValid(): void {
    assert(this.pricePerAlgoMicroUsd.value > Uint64(0), 'price required')
    assert(this.updatedAt.value > Uint64(0), 'timestamp required')
    assert(this.updatedRound.value > Uint64(0), 'round required')
    assert(this.maxAgeSeconds.value > Uint64(0), 'max age required')
    assert(this.source.value.length > Uint64(0), 'source required')
    assert(this.source.value.length <= MAX_SOURCE_BYTES, 'source too long')
    assert(this.updatedAt.value <= Global.latestTimestamp, 'timestamp future')
    assert(this.updatedRound.value <= Global.round, 'round future')
  }

  private isCurrentSampleFresh(): boolean {
    if (this.pricePerAlgoMicroUsd.value === Uint64(0)) return false
    if (this.updatedAt.value === Uint64(0)) return false
    if (this.updatedRound.value === Uint64(0)) return false
    if (this.maxAgeSeconds.value === Uint64(0)) return false
    if ((this.pauseFlags.value & ORACLE_PAUSE_READS) !== Uint64(0)) return false
    if (this.updatedAt.value > Global.latestTimestamp) return false
    if (this.updatedRound.value > Global.round) return false
    const sampleAge: uint64 = Global.latestTimestamp - this.updatedAt.value
    return sampleAge <= this.maxAgeSeconds.value
  }

  private validateSample(
    pricePerAlgoMicroUsd: uint64,
    updatedAt: uint64,
    updatedRound: uint64,
    maxAgeSeconds: uint64,
    source: bytes
  ): void {
    assert(pricePerAlgoMicroUsd > Uint64(0), 'price required')
    assert(updatedAt > Uint64(0), 'timestamp required')
    assert(updatedRound > Uint64(0), 'round required')
    assert(maxAgeSeconds > Uint64(0), 'max age required')
    assert(source.length > Uint64(0), 'source required')
    assert(source.length <= MAX_SOURCE_BYTES, 'source too long')
    assert(updatedAt <= Global.latestTimestamp, 'timestamp future')
    assert(updatedRound <= Global.round, 'round future')
    const sampleAge: uint64 = Global.latestTimestamp - updatedAt
    assert(sampleAge <= maxAgeSeconds, 'price stale')
  }
}
