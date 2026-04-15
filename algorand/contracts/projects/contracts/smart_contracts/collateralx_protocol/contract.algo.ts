import {
  Account,
  Application,
  Asset,
  BoxMap,
  Bytes,
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
  itxn,
  op,
  readonly,
  type uint64,
} from '@algorandfoundation/algorand-typescript'
import {
  Address as Arc4Address,
  Uint as Arc4Uint,
  abimethod,
  methodSelector,
} from '@algorandfoundation/algorand-typescript/arc4'
import {
  BPS_DENOMINATOR,
  availableToMintMicroStable,
  isHealthyDebt,
  safeAdd,
} from '../collateralx_shared/risk.algo'

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

const ORACLE_PAUSE_READS: uint64 = Uint64(2)

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

type CollateralDepositedEvent = {
  vaultId: uint64
  owner: Account
  amountMicroAlgo: uint64
  newCollateralMicroAlgo: uint64
  totalCollateralMicroAlgo: uint64
}

type StablecoinMintedEvent = {
  vaultId: uint64
  owner: Account
  amountMicroStable: uint64
  newDebtMicroStable: uint64
  totalDebtMicroStable: uint64
}

type OracleSnapshot = {
  pricePerAlgoMicroStable: uint64
  updatedAt: uint64
  maxAgeSeconds: uint64
}

type StablecoinSnapshot = {
  stableAssetId: uint64
  issuedSupplyMicroStable: uint64
  supplyCeilingMicroStable: uint64
}

/**
 * Protocol/vault manager.
 *
 * Safety-critical assumption: this contract owns the protocol's canonical vault
 * boxes, while the stablecoin controller owns ASA reserve movement. Minting is
 * only requested by this app after vault health, caps, and oracle freshness pass.
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
    assert(this.totalDebtMicroStable.value <= protocolDebtCeilingMicroStable, 'ceiling below debt')

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

  /**
   * Returns the currently mintable amount for a vault after applying collateral,
   * per-vault, protocol debt, and stablecoin supply ceilings. Requires vault box,
   * oracle app, and stablecoin controller app resources.
   */
  @readonly
  public readMaxMintable(vaultId: uint64): uint64 {
    this.assertReady()
    assert(this.vaults(vaultId).exists, 'vault missing')
    const vault = clone(this.vaults(vaultId).value)
    const oracle = this.readFreshOracle()
    const stablecoin = this.readStablecoinSnapshot()
    return this.calculateAvailableToMint(vault, oracle.pricePerAlgoMicroStable, stablecoin)
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
    assert(this.totalDebtMicroStable.value <= protocolDebtCeilingMicroStable, 'ceiling below debt')

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

  /**
   * Deposits ALGO collateral into a vault.
   *
   * Required group shape:
   * - tx 0: payment from vault owner to this app address
   * - tx 1: this app call with the payment transaction argument
   */
  public depositCollateral(payment: gtxn.PaymentTxn, vaultId: uint64): void {
    this.assertReady()
    this.assertDepositGroup(payment)
    this.assertNotPaused(PAUSE_DEPOSIT)
    assert(this.vaults(vaultId).exists, 'vault missing')
    const vault = clone(this.vaults(vaultId).value)
    assert(vault.status === VAULT_STATUS_ACTIVE, 'vault inactive')
    assert(vault.owner === Txn.sender, 'vault owner only')
    assert(payment.sender === Txn.sender, 'payment sender mismatch')
    assert(payment.receiver === Global.currentApplicationAddress, 'payment receiver mismatch')
    assert(payment.rekeyTo === Global.zeroAddress, 'payment rekey forbidden')
    assert(payment.closeRemainderTo === Global.zeroAddress, 'payment close forbidden')
    assert(payment.amount > Uint64(0), 'zero deposit')

    const newCollateral = safeAdd(vault.collateralMicroAlgo, payment.amount)
    const newTotalCollateral = safeAdd(this.totalCollateralMicroAlgo.value, payment.amount)
    vault.collateralMicroAlgo = newCollateral
    vault.updatedAt = Global.latestTimestamp
    this.vaults(vaultId).value = clone(vault)
    this.totalCollateralMicroAlgo.value = newTotalCollateral

    emit<CollateralDepositedEvent>({
      vaultId,
      owner: Txn.sender,
      amountMicroAlgo: payment.amount,
      newCollateralMicroAlgo: newCollateral,
      totalCollateralMicroAlgo: newTotalCollateral,
    })
  }

  /**
   * Mints stablecoin to the vault owner through the stablecoin controller.
   *
   * This call must be a single outer transaction. It performs a protocol-gated
   * inner app call to the stablecoin controller, which then transfers ASA units
   * from its reserve account to the vault owner.
   */
  public mintStablecoin(vaultId: uint64, amountMicroStable: uint64): void {
    this.assertReady()
    this.assertSingleCallGroup()
    this.assertNotPaused(PAUSE_MINT)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(amountMicroStable > Uint64(0), 'zero mint')
    const vault = clone(this.vaults(vaultId).value)
    assert(vault.status === VAULT_STATUS_ACTIVE, 'vault inactive')
    assert(vault.owner === Txn.sender, 'vault owner only')

    const oracle = this.readFreshOracle()
    const stablecoin = this.readStablecoinSnapshot()
    const availableToMint = this.calculateAvailableToMint(vault, oracle.pricePerAlgoMicroStable, stablecoin)
    assert(amountMicroStable <= availableToMint, 'mint exceeds safe amount')

    const newVaultDebt = safeAdd(vault.debtMicroStable, amountMicroStable)
    const newTotalDebt = safeAdd(this.totalDebtMicroStable.value, amountMicroStable)
    assert(newVaultDebt >= this.minDebtFloorMicroStable.value, 'debt below floor')
    assert(isHealthyDebt(vault.collateralMicroAlgo, newVaultDebt, oracle.pricePerAlgoMicroStable, this.minCollateralRatioBps.value), 'vault unhealthy')

    this.callStablecoinMint(vault, amountMicroStable, stablecoin.stableAssetId)

    vault.debtMicroStable = newVaultDebt
    vault.updatedAt = Global.latestTimestamp
    this.vaults(vaultId).value = clone(vault)
    this.totalDebtMicroStable.value = newTotalDebt

    emit<StablecoinMintedEvent>({
      vaultId,
      owner: Txn.sender,
      amountMicroStable,
      newDebtMicroStable: newVaultDebt,
      totalDebtMicroStable: newTotalDebt,
    })
  }

  /** Repayment entry point reserved for the repayment module. */
  public repay(repayment: gtxn.AssetTransferTxn, vaultId: uint64): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_REPAY)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(repayment.sender === Txn.sender, 'repay sender mismatch')
    assert(repayment.assetAmount > Uint64(0), 'zero repay')
    err('repay module disabled')
  }

  /** Withdraw entry point reserved for the withdrawal module. */
  public withdrawCollateral(vaultId: uint64, amountMicroAlgo: uint64): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_WITHDRAW)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(amountMicroAlgo > Uint64(0), 'zero withdraw')
    err('withdraw module disabled')
  }

  /** Liquidation entry point reserved for keeper/executor integration. */
  public liquidate(repayment: gtxn.AssetTransferTxn, vaultId: uint64): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_LIQUIDATE)
    assert(this.vaults(vaultId).exists, 'vault missing')
    assert(repayment.assetAmount > Uint64(0), 'zero liquidation')
    err('liquidation module disabled')
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

  private assertDepositGroup(payment: gtxn.PaymentTxn): void {
    assert(Global.groupSize === Uint64(2), 'deposit group size')
    assert(payment.groupIndex === Uint64(0), 'deposit payment index')
    assert(Txn.groupIndex === Uint64(1), 'deposit app call index')
  }

  private assertSingleCallGroup(): void {
    assert(Global.groupSize === Uint64(1), 'mint group size')
    assert(Txn.groupIndex === Uint64(0), 'mint app call index')
  }

  private readFreshOracle(): OracleSnapshot {
    assert(this.oracleAppId.value > Uint64(0), 'oracle app required')
    const oracleApp = Application(this.oracleAppId.value)

    const [price, priceExists] = op.AppGlobal.getExUint64(oracleApp, Bytes('px'))
    const [updatedAt, updatedAtExists] = op.AppGlobal.getExUint64(oracleApp, Bytes('upd'))
    const [maxAgeSeconds, maxAgeExists] = op.AppGlobal.getExUint64(oracleApp, Bytes('maxa'))
    const [oraclePauseFlags, pauseFlagsExist] = op.AppGlobal.getExUint64(oracleApp, Bytes('pflg'))

    assert(priceExists, 'oracle price missing')
    assert(updatedAtExists, 'oracle timestamp missing')
    assert(maxAgeExists, 'oracle max age missing')
    assert(pauseFlagsExist, 'oracle pause missing')
    assert(price > Uint64(0), 'oracle price required')
    assert(updatedAt > Uint64(0), 'oracle timestamp required')
    assert(maxAgeSeconds > Uint64(0), 'oracle max age required')
    assert((oraclePauseFlags & ORACLE_PAUSE_READS) === Uint64(0), 'oracle reads paused')
    assert(updatedAt <= Global.latestTimestamp, 'oracle timestamp future')

    const oracleAge: uint64 = Global.latestTimestamp - updatedAt
    assert(oracleAge <= this.oracleFreshnessWindowSeconds.value, 'oracle stale')
    assert(oracleAge <= maxAgeSeconds, 'oracle stale')

    return {
      pricePerAlgoMicroStable: price,
      updatedAt,
      maxAgeSeconds,
    }
  }

  private readStablecoinSnapshot(): StablecoinSnapshot {
    assert(this.stablecoinAppId.value > Uint64(0), 'stablecoin app required')
    const stablecoinApp = Application(this.stablecoinAppId.value)

    const [stableAssetId, stableAssetExists] = op.AppGlobal.getExUint64(stablecoinApp, Bytes('asa'))
    const [issuedSupply, issuedSupplyExists] = op.AppGlobal.getExUint64(stablecoinApp, Bytes('supply'))
    const [supplyCeiling, supplyCeilingExists] = op.AppGlobal.getExUint64(stablecoinApp, Bytes('ceil'))

    assert(stableAssetExists, 'stable asset missing')
    assert(issuedSupplyExists, 'stable supply missing')
    assert(supplyCeilingExists, 'stable ceiling missing')
    assert(stableAssetId > Uint64(0), 'stable asset required')
    assert(supplyCeiling > Uint64(0), 'stable ceiling required')

    return {
      stableAssetId,
      issuedSupplyMicroStable: issuedSupply,
      supplyCeilingMicroStable: supplyCeiling,
    }
  }

  private calculateAvailableToMint(
    vault: VaultRecord,
    pricePerAlgoMicroStable: uint64,
    stablecoin: StablecoinSnapshot
  ): uint64 {
    return availableToMintMicroStable(
      vault.collateralMicroAlgo,
      vault.debtMicroStable,
      pricePerAlgoMicroStable,
      this.minCollateralRatioBps.value,
      this.vaultMintCapMicroStable.value,
      this.totalDebtMicroStable.value,
      this.protocolDebtCeilingMicroStable.value,
      stablecoin.issuedSupplyMicroStable,
      stablecoin.supplyCeilingMicroStable
    )
  }

  private callStablecoinMint(vault: VaultRecord, amountMicroStable: uint64, stableAssetId: uint64): void {
    const stablecoinApp = Application(this.stablecoinAppId.value)
    const stableAsset = Asset(stableAssetId)
    itxn
      .applicationCall({
        appId: stablecoinApp,
        fee: Uint64(0),
        appArgs: [
          methodSelector('mintForVault(uint64,address,uint64)void'),
          new Arc4Uint<64>(vault.id).bytes,
          new Arc4Address(vault.owner).bytes,
          new Arc4Uint<64>(amountMicroStable).bytes,
        ],
        accounts: [vault.owner, stablecoinApp.address],
        assets: [stableAsset],
      })
      .submit()
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
