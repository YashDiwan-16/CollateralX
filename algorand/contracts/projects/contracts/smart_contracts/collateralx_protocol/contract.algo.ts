import {
  Account,
  Application,
  BoxMap,
  Contract,
  Global,
  GlobalState,
  Txn,
  Uint64,
  assert,
  clone,
  emit,
  err,
  gtxn,
  readonly,
  type uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod } from '@algorandfoundation/algorand-typescript/arc4'

const BPS_DENOMINATOR: uint64 = Uint64(10_000)
const MAX_BPS: uint64 = Uint64(100_000)
const VAULT_STATUS_ACTIVE: uint64 = Uint64(1)
const VAULT_SCHEMA_VERSION: uint64 = Uint64(1)

const PAUSE_DEPOSIT: uint64 = Uint64(1)
const PAUSE_MINT: uint64 = Uint64(2)
const PAUSE_REPAY: uint64 = Uint64(4)
const PAUSE_WITHDRAW: uint64 = Uint64(8)
const PAUSE_LIQUIDATE: uint64 = Uint64(16)
const PAUSE_CREATE_VAULT: uint64 = Uint64(32)
const PAUSE_EMERGENCY: uint64 = Uint64(64)

export type ProtocolParamsSnapshot = {
  minCollateralRatioBps: uint64
  liquidationRatioBps: uint64
  liquidationPenaltyBps: uint64
  liquidationBonusBps: uint64
  oracleFreshnessWindowSeconds: uint64
  vaultMintCapMicroStable: uint64
  protocolDebtCeilingMicroStable: uint64
  minDebtFloorMicroStable: uint64
}

export type ProtocolStatusSnapshot = {
  admin: Account
  initialized: uint64
  nextVaultId: uint64
  vaultCount: uint64
  totalDebtMicroStable: uint64
  totalCollateralMicroAlgo: uint64
  pauseFlags: uint64
  oracleAppId: uint64
  stablecoinAppId: uint64
  liquidationAppId: uint64
}

export type VaultRecord = {
  id: uint64
  owner: Account
  collateralMicroAlgo: uint64
  debtMicroStable: uint64
  createdAt: uint64
  updatedAt: uint64
  status: uint64
  version: uint64
}

type OwnerVaultIndexKey = {
  owner: Account
  vaultId: uint64
}

type ProtocolInitializedEvent = {
  admin: Account
  oracleAppId: uint64
  stablecoinAppId: uint64
  liquidationAppId: uint64
}

type ProtocolParamsUpdatedEvent = {
  admin: Account
  minCollateralRatioBps: uint64
  liquidationRatioBps: uint64
  protocolDebtCeilingMicroStable: uint64
}

type ProtocolPauseFlagsUpdatedEvent = {
  admin: Account
  pauseFlags: uint64
}

type ProtocolIntegrationsUpdatedEvent = {
  admin: Account
  oracleAppId: uint64
  stablecoinAppId: uint64
  liquidationAppId: uint64
}

type VaultCreatedEvent = {
  vaultId: uint64
  owner: Account
  createdAt: uint64
}

/**
 * Protocol/vault manager skeleton.
 *
 * Safety-critical assumption: this contract owns the protocol's canonical vault
 * boxes. Economic methods are intentionally stubs until grouped funding,
 * oracle validation, and ASA movement are implemented and audited.
 */
export class CollateralXProtocolManager extends Contract {
  admin = GlobalState<Account>({ key: 'adm' })
  initialized = GlobalState<uint64>({ key: 'init', initialValue: Uint64(0) })
  nextVaultId = GlobalState<uint64>({ key: 'nvid', initialValue: Uint64(1) })
  vaultCount = GlobalState<uint64>({ key: 'vcnt', initialValue: Uint64(0) })
  totalDebtMicroStable = GlobalState<uint64>({ key: 'tdbt', initialValue: Uint64(0) })
  totalCollateralMicroAlgo = GlobalState<uint64>({ key: 'tcol', initialValue: Uint64(0) })
  minCollateralRatioBps = GlobalState<uint64>({ key: 'mcr', initialValue: Uint64(0) })
  liquidationRatioBps = GlobalState<uint64>({ key: 'lqr', initialValue: Uint64(0) })
  liquidationPenaltyBps = GlobalState<uint64>({ key: 'lpn', initialValue: Uint64(0) })
  liquidationBonusBps = GlobalState<uint64>({ key: 'lbn', initialValue: Uint64(0) })
  oracleFreshnessWindowSeconds = GlobalState<uint64>({ key: 'ofw', initialValue: Uint64(0) })
  vaultMintCapMicroStable = GlobalState<uint64>({ key: 'vmcp', initialValue: Uint64(0) })
  protocolDebtCeilingMicroStable = GlobalState<uint64>({ key: 'pdc', initialValue: Uint64(0) })
  minDebtFloorMicroStable = GlobalState<uint64>({ key: 'dflo', initialValue: Uint64(0) })
  pauseFlags = GlobalState<uint64>({ key: 'pflg', initialValue: Uint64(0) })
  oracleAppId = GlobalState<uint64>({ key: 'oapp', initialValue: Uint64(0) })
  stablecoinAppId = GlobalState<uint64>({ key: 'sapp', initialValue: Uint64(0) })
  liquidationAppId = GlobalState<uint64>({ key: 'lapp', initialValue: Uint64(0) })

  vaults = BoxMap<uint64, VaultRecord>({ keyPrefix: 'v' })
  ownerVaults = BoxMap<OwnerVaultIndexKey, uint64>({ keyPrefix: 'o' })

  /**
   * Sets the immutable bootstrap admin at application creation.
   * Protocol params are initialized separately so deployers can fund the app
   * account for boxes before vault creation starts.
   */
  @abimethod({ onCreate: 'require' })
  public createApplication(admin: Account): void {
    assert(admin !== Global.zeroAddress, 'admin required')
    this.admin.value = admin
    emit('ProtocolAdminCreated', admin)
  }

  /**
   * One-time protocol initialization. Only the bootstrap admin can call this.
   */
  public initializeProtocol(
    minCollateralRatioBps: uint64,
    liquidationRatioBps: uint64,
    liquidationPenaltyBps: uint64,
    liquidationBonusBps: uint64,
    oracleFreshnessWindowSeconds: uint64,
    vaultMintCapMicroStable: uint64,
    protocolDebtCeilingMicroStable: uint64,
    minDebtFloorMicroStable: uint64,
    oracleAppId: uint64,
    stablecoinAppId: uint64,
    liquidationAppId: uint64
  ): void {
    this.assertAdmin()
    assert(this.initialized.value === Uint64(0), 'already initialized')
    this.validateParams(
      minCollateralRatioBps,
      liquidationRatioBps,
      liquidationPenaltyBps,
      liquidationBonusBps,
      oracleFreshnessWindowSeconds,
      vaultMintCapMicroStable,
      protocolDebtCeilingMicroStable,
      minDebtFloorMicroStable
    )

    this.minCollateralRatioBps.value = minCollateralRatioBps
    this.liquidationRatioBps.value = liquidationRatioBps
    this.liquidationPenaltyBps.value = liquidationPenaltyBps
    this.liquidationBonusBps.value = liquidationBonusBps
    this.oracleFreshnessWindowSeconds.value = oracleFreshnessWindowSeconds
    this.vaultMintCapMicroStable.value = vaultMintCapMicroStable
    this.protocolDebtCeilingMicroStable.value = protocolDebtCeilingMicroStable
    this.minDebtFloorMicroStable.value = minDebtFloorMicroStable
    this.oracleAppId.value = oracleAppId
    this.stablecoinAppId.value = stablecoinAppId
    this.liquidationAppId.value = liquidationAppId
    this.initialized.value = Uint64(1)

    emit<ProtocolInitializedEvent>({
      admin: this.admin.value,
      oracleAppId,
      stablecoinAppId,
      liquidationAppId,
    })
  }

  /**
   * Creates an empty vault owned by the sender and returns its deterministic id.
   * The caller must include box refs and the app account must already have MBR.
   */
  public createVault(): uint64 {
    this.assertReady()
    this.assertNotPaused(PAUSE_CREATE_VAULT)

    const vaultId: uint64 = this.nextVaultId.value
    assert(!this.vaults(vaultId).exists, 'vault exists')

    const now: uint64 = Global.latestTimestamp
    const vault: VaultRecord = {
      id: vaultId,
      owner: Txn.sender,
      collateralMicroAlgo: Uint64(0),
      debtMicroStable: Uint64(0),
      createdAt: now,
      updatedAt: now,
      status: VAULT_STATUS_ACTIVE,
      version: VAULT_SCHEMA_VERSION,
    }

    this.vaults(vaultId).value = clone(vault)
    this.ownerVaults({ owner: Txn.sender, vaultId }).value = Uint64(1)
    this.nextVaultId.value = vaultId + Uint64(1)
    this.vaultCount.value = this.vaultCount.value + Uint64(1)

    emit<VaultCreatedEvent>({ vaultId, owner: Txn.sender, createdAt: now })
    return vaultId
  }

  /** Read a vault record by deterministic id. Requires the vault box ref. */
  @readonly
  public readVault(vaultId: uint64): VaultRecord {
    assert(this.vaults(vaultId).exists, 'vault missing')
    return clone(this.vaults(vaultId).value)
  }

  /** True when the vault box exists. Useful for frontends and keepers. */
  @readonly
  public vaultExists(vaultId: uint64): boolean {
    return this.vaults(vaultId).exists
  }

  /** Returns protocol-wide counters, pause flags, and integration ids. */
  @readonly
  public readProtocolStatus(): ProtocolStatusSnapshot {
    return {
      admin: this.admin.value,
      initialized: this.initialized.value,
      nextVaultId: this.nextVaultId.value,
      vaultCount: this.vaultCount.value,
      totalDebtMicroStable: this.totalDebtMicroStable.value,
      totalCollateralMicroAlgo: this.totalCollateralMicroAlgo.value,
      pauseFlags: this.pauseFlags.value,
      oracleAppId: this.oracleAppId.value,
      stablecoinAppId: this.stablecoinAppId.value,
      liquidationAppId: this.liquidationAppId.value,
    }
  }

  /** Returns protocol risk parameters. */
  @readonly
  public readProtocolParams(): ProtocolParamsSnapshot {
    return {
      minCollateralRatioBps: this.minCollateralRatioBps.value,
      liquidationRatioBps: this.liquidationRatioBps.value,
      liquidationPenaltyBps: this.liquidationPenaltyBps.value,
      liquidationBonusBps: this.liquidationBonusBps.value,
      oracleFreshnessWindowSeconds: this.oracleFreshnessWindowSeconds.value,
      vaultMintCapMicroStable: this.vaultMintCapMicroStable.value,
      protocolDebtCeilingMicroStable: this.protocolDebtCeilingMicroStable.value,
      minDebtFloorMicroStable: this.minDebtFloorMicroStable.value,
    }
  }

  /** Admin-only full parameter update. Future governance can wrap this call. */
  public adminSetParams(
    minCollateralRatioBps: uint64,
    liquidationRatioBps: uint64,
    liquidationPenaltyBps: uint64,
    liquidationBonusBps: uint64,
    oracleFreshnessWindowSeconds: uint64,
    vaultMintCapMicroStable: uint64,
    protocolDebtCeilingMicroStable: uint64,
    minDebtFloorMicroStable: uint64
  ): void {
    this.assertReady()
    this.assertAdmin()
    this.validateParams(
      minCollateralRatioBps,
      liquidationRatioBps,
      liquidationPenaltyBps,
      liquidationBonusBps,
      oracleFreshnessWindowSeconds,
      vaultMintCapMicroStable,
      protocolDebtCeilingMicroStable,
      minDebtFloorMicroStable
    )

    this.minCollateralRatioBps.value = minCollateralRatioBps
    this.liquidationRatioBps.value = liquidationRatioBps
    this.liquidationPenaltyBps.value = liquidationPenaltyBps
    this.liquidationBonusBps.value = liquidationBonusBps
    this.oracleFreshnessWindowSeconds.value = oracleFreshnessWindowSeconds
    this.vaultMintCapMicroStable.value = vaultMintCapMicroStable
    this.protocolDebtCeilingMicroStable.value = protocolDebtCeilingMicroStable
    this.minDebtFloorMicroStable.value = minDebtFloorMicroStable

    emit<ProtocolParamsUpdatedEvent>({
      admin: Txn.sender,
      minCollateralRatioBps,
      liquidationRatioBps,
      protocolDebtCeilingMicroStable,
    })
  }

  /** Admin-only integration pointer update for replaceable modules. */
  public adminSetIntegrations(
    oracleAppId: uint64,
    stablecoinAppId: uint64,
    liquidationAppId: uint64
  ): void {
    this.assertReady()
    this.assertAdmin()
    this.oracleAppId.value = oracleAppId
    this.stablecoinAppId.value = stablecoinAppId
    this.liquidationAppId.value = liquidationAppId
    emit<ProtocolIntegrationsUpdatedEvent>({
      admin: Txn.sender,
      oracleAppId,
      stablecoinAppId,
      liquidationAppId,
    })
  }

  /** Admin-only replacement of the pause bitmask. */
  public adminSetPauseFlags(pauseFlags: uint64): void {
    this.assertReady()
    this.assertAdmin()
    this.pauseFlags.value = pauseFlags
    emit<ProtocolPauseFlagsUpdatedEvent>({ admin: Txn.sender, pauseFlags })
  }

  /** Admin transfer is explicit and logged for governance/indexers. */
  public adminTransfer(newAdmin: Account): void {
    this.assertReady()
    this.assertAdmin()
    assert(newAdmin !== Global.zeroAddress, 'admin required')
    this.admin.value = newAdmin
    emit('ProtocolAdminTransferred', Txn.sender, newAdmin)
  }

  /** Future phase: grouped payment will increase collateral and aggregate TVL. */
  public depositCollateral(vaultId: uint64, payment: gtxn.PaymentTxn): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_DEPOSIT)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(payment.sender === Txn.sender, 'payment sender mismatch')
    assert(payment.receiver === Global.currentApplicationAddress, 'payment receiver mismatch')
    assert(payment.amount > Uint64(0), 'zero deposit')
    err('deposit not implemented')
  }

  /** Future phase: stablecoin controller will mint ASA units after risk checks. */
  public mintStablecoin(vaultId: uint64, amountMicroStable: uint64): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_MINT)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(amountMicroStable > Uint64(0), 'zero mint')
    err('mint not implemented')
  }

  /** Future phase: stablecoin ASA transfer will burn or escrow repayment. */
  public repay(vaultId: uint64, repayment: gtxn.AssetTransferTxn): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_REPAY)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(repayment.sender === Txn.sender, 'repay sender mismatch')
    assert(repayment.assetAmount > Uint64(0), 'zero repay')
    err('repay not implemented')
  }

  /** Future phase: sends collateral back after preserving collateral ratio. */
  public withdrawCollateral(vaultId: uint64, amountMicroAlgo: uint64): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_WITHDRAW)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(amountMicroAlgo > Uint64(0), 'zero withdraw')
    err('withdraw not implemented')
  }

  /** Future phase: called directly or by the liquidation executor app. */
  public liquidate(vaultId: uint64, repayment: gtxn.AssetTransferTxn): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_LIQUIDATE)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(repayment.assetAmount > Uint64(0), 'zero liquidation')
    err('liquidate not implemented')
  }

  private assertReady(): void {
    assert(this.initialized.value === Uint64(1), 'protocol not initialized')
  }

  private assertAdmin(): void {
    assert(Txn.sender === this.admin.value, 'admin only')
  }

  private assertNotPaused(actionFlag: uint64): void {
    const emergencyActive: uint64 = this.pauseFlags.value & PAUSE_EMERGENCY
    const actionActive: uint64 = this.pauseFlags.value & actionFlag
    assert(emergencyActive === Uint64(0), 'emergency paused')
    assert(actionActive === Uint64(0), 'action paused')
  }

  private validateParams(
    minCollateralRatioBps: uint64,
    liquidationRatioBps: uint64,
    liquidationPenaltyBps: uint64,
    liquidationBonusBps: uint64,
    oracleFreshnessWindowSeconds: uint64,
    vaultMintCapMicroStable: uint64,
    protocolDebtCeilingMicroStable: uint64,
    minDebtFloorMicroStable: uint64
  ): void {
    assert(minCollateralRatioBps >= BPS_DENOMINATOR, 'min ratio too low')
    assert(liquidationRatioBps >= BPS_DENOMINATOR, 'liquidation ratio too low')
    assert(liquidationRatioBps <= minCollateralRatioBps, 'liquidation ratio above min')
    assert(liquidationPenaltyBps <= MAX_BPS, 'penalty too high')
    assert(liquidationBonusBps <= MAX_BPS, 'bonus too high')
    assert(oracleFreshnessWindowSeconds > Uint64(0), 'oracle window required')
    assert(vaultMintCapMicroStable > Uint64(0), 'vault cap required')
    assert(protocolDebtCeilingMicroStable >= vaultMintCapMicroStable, 'ceiling below vault cap')
    assert(minDebtFloorMicroStable <= vaultMintCapMicroStable, 'debt floor too high')
  }
}

