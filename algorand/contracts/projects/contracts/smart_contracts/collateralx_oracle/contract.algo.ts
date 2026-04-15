import {
  Account,
  Contract,
  Global,
  GlobalState,
  Txn,
  Uint64,
  assert,
  emit,
  err,
  readonly,
  type bytes,
  type uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod } from '@algorandfoundation/algorand-typescript/arc4'

const MAX_SOURCE_BYTES: uint64 = Uint64(64)
const PAUSE_ORACLE_UPDATES: uint64 = Uint64(1)
const PAUSE_ORACLE_READS: uint64 = Uint64(2)

export type OracleSample = {
  pricePerAlgoMicroUsd: uint64
  updatedAt: uint64
  source: bytes
  maxAgeSeconds: uint64
  pauseFlags: uint64
}

type OracleInitializedEvent = {
  admin: Account
  pricePerAlgoMicroUsd: uint64
  updatedAt: uint64
}

type OracleUpdatedEvent = {
  admin: Account
  pricePerAlgoMicroUsd: uint64
  updatedAt: uint64
}

/**
 * Oracle adapter skeleton.
 *
 * Safety-critical assumption: this phase stores a manually supplied oracle
 * sample only. A later phase must verify the source feed and update authority
 * before the protocol manager consumes this in economic actions.
 */
export class CollateralXOracleAdapter extends Contract {
  admin = GlobalState<Account>({ key: 'adm' })
  initialized = GlobalState<uint64>({ key: 'init', initialValue: Uint64(0) })
  pricePerAlgoMicroUsd = GlobalState<uint64>({ key: 'px', initialValue: Uint64(0) })
  updatedAt = GlobalState<uint64>({ key: 'upd', initialValue: Uint64(0) })
  source = GlobalState<bytes>({ key: 'src' })
  maxAgeSeconds = GlobalState<uint64>({ key: 'maxa', initialValue: Uint64(0) })
  pauseFlags = GlobalState<uint64>({ key: 'pflg', initialValue: Uint64(0) })

  @abimethod({ onCreate: 'require' })
  public createApplication(admin: Account): void {
    assert(admin !== Global.zeroAddress, 'admin required')
    this.admin.value = admin
    emit('OracleAdminCreated', admin)
  }

  /** One-time adapter initialization by admin. */
  public initializeOracle(
    pricePerAlgoMicroUsd: uint64,
    updatedAt: uint64,
    maxAgeSeconds: uint64,
    source: bytes
  ): void {
    this.assertAdmin()
    assert(this.initialized.value === Uint64(0), 'already initialized')
    this.validateSample(pricePerAlgoMicroUsd, updatedAt, maxAgeSeconds, source)
    this.pricePerAlgoMicroUsd.value = pricePerAlgoMicroUsd
    this.updatedAt.value = updatedAt
    this.maxAgeSeconds.value = maxAgeSeconds
    this.source.value = source
    this.initialized.value = Uint64(1)
    emit<OracleInitializedEvent>({ admin: Txn.sender, pricePerAlgoMicroUsd, updatedAt })
  }

  /** Read the current oracle sample. */
  @readonly
  public readOraclePrice(): OracleSample {
    this.assertReady()
    this.assertNotPaused(PAUSE_ORACLE_READS)
    return {
      pricePerAlgoMicroUsd: this.pricePerAlgoMicroUsd.value,
      updatedAt: this.updatedAt.value,
      source: this.source.value,
      maxAgeSeconds: this.maxAgeSeconds.value,
      pauseFlags: this.pauseFlags.value,
    }
  }

  /** Admin-only manual oracle update placeholder. */
  public adminUpdatePrice(pricePerAlgoMicroUsd: uint64, updatedAt: uint64, source: bytes): void {
    this.assertReady()
    this.assertAdmin()
    this.assertNotPaused(PAUSE_ORACLE_UPDATES)
    this.validateSample(pricePerAlgoMicroUsd, updatedAt, this.maxAgeSeconds.value, source)
    this.pricePerAlgoMicroUsd.value = pricePerAlgoMicroUsd
    this.updatedAt.value = updatedAt
    this.source.value = source
    emit<OracleUpdatedEvent>({ admin: Txn.sender, pricePerAlgoMicroUsd, updatedAt })
  }

  /** Admin-only adapter configuration update. */
  public adminSetOracleConfig(maxAgeSeconds: uint64): void {
    this.assertReady()
    this.assertAdmin()
    assert(maxAgeSeconds > Uint64(0), 'max age required')
    this.maxAgeSeconds.value = maxAgeSeconds
    emit('OracleConfigUpdated', Txn.sender, maxAgeSeconds)
  }

  /** Admin-only replacement of oracle pause flags. */
  public adminSetPauseFlags(pauseFlags: uint64): void {
    this.assertReady()
    this.assertAdmin()
    this.pauseFlags.value = pauseFlags
    emit('OraclePauseFlagsUpdated', Txn.sender, pauseFlags)
  }

  /** Future phase: verify an external oracle proof or delegated feed update. */
  public verifyExternalPriceUpdate(proof: bytes): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_ORACLE_UPDATES)
    assert(proof.length > Uint64(0), 'proof required')
    err('oracle proof verification not implemented')
  }

  private assertReady(): void {
    assert(this.initialized.value === Uint64(1), 'oracle not initialized')
  }

  private assertAdmin(): void {
    assert(Txn.sender === this.admin.value, 'admin only')
  }

  private assertNotPaused(flag: uint64): void {
    const active: uint64 = this.pauseFlags.value & flag
    assert(active === Uint64(0), 'oracle paused')
  }

  private validateSample(
    pricePerAlgoMicroUsd: uint64,
    updatedAt: uint64,
    maxAgeSeconds: uint64,
    source: bytes
  ): void {
    assert(pricePerAlgoMicroUsd > Uint64(0), 'price required')
    assert(updatedAt > Uint64(0), 'timestamp required')
    assert(maxAgeSeconds > Uint64(0), 'max age required')
    assert(source.length > Uint64(0), 'source required')
    assert(source.length <= MAX_SOURCE_BYTES, 'source too long')
  }
}

