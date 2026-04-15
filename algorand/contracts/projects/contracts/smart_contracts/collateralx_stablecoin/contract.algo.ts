import {
  Account,
  Application,
  Asset,
  Contract,
  Global,
  GlobalState,
  Txn,
  Uint64,
  assert,
  emit,
  itxn,
  readonly,
  type uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod } from '@algorandfoundation/algorand-typescript/arc4'
import { safeAdd, safeSub } from '../collateralx_shared/risk.algo'

const PAUSE_MINT: uint64 = Uint64(1)
const PAUSE_BURN: uint64 = Uint64(2)

export type StablecoinControlState = {
  admin: Account
  initialized: uint64
  protocolManagerAppId: uint64
  stableAssetId: uint64
  issuedSupplyMicroStable: uint64
  supplyCeilingMicroStable: uint64
  pauseFlags: uint64
}

type StablecoinControllerInitializedEvent = {
  admin: Account
  protocolManagerAppId: uint64
  stableAssetId: uint64
  supplyCeilingMicroStable: uint64
}

type StablecoinAssetOptedInEvent = {
  admin: Account
  stableAssetId: uint64
}

type StablecoinMintedForVaultEvent = {
  vaultId: uint64
  receiver: Account
  amountMicroStable: uint64
  issuedSupplyMicroStable: uint64
}

type StablecoinRetiredForVaultEvent = {
  vaultId: uint64
  amountMicroStable: uint64
  issuedSupplyMicroStable: uint64
}

/**
 * Stablecoin control logic.
 *
 * Safety-critical assumption: the stable ASA has a fixed reserve held by this
 * app account. The protocol manager is the only caller allowed to move reserve
 * units to vault owners.
 */
export class CollateralXStablecoinController extends Contract {
  admin = GlobalState<Account>({ key: 'adm' })
  initialized = GlobalState<uint64>({ key: 'init', initialValue: Uint64(0) })
  protocolManagerAppId = GlobalState<uint64>({ key: 'mgr', initialValue: Uint64(0) })
  stableAssetId = GlobalState<uint64>({ key: 'asa', initialValue: Uint64(0) })
  issuedSupplyMicroStable = GlobalState<uint64>({ key: 'supply', initialValue: Uint64(0) })
  supplyCeilingMicroStable = GlobalState<uint64>({ key: 'ceil', initialValue: Uint64(0) })
  pauseFlags = GlobalState<uint64>({ key: 'pflg', initialValue: Uint64(0) })

  @abimethod({ onCreate: 'require' })
  public createApplication(admin: Account): void {
    assert(admin !== Global.zeroAddress, 'admin required')
    this.admin.value = admin
    emit('StablecoinAdminCreated', admin)
  }

  /** One-time stablecoin controller initialization by admin. */
  public initializeStablecoinController(
    protocolManagerAppId: uint64,
    stableAssetId: uint64,
    supplyCeilingMicroStable: uint64
  ): void {
    this.assertAdmin()
    assert(this.initialized.value === Uint64(0), 'already initialized')
    this.validateConfig(protocolManagerAppId, supplyCeilingMicroStable)
    this.protocolManagerAppId.value = protocolManagerAppId
    this.stableAssetId.value = stableAssetId
    this.supplyCeilingMicroStable.value = supplyCeilingMicroStable
    this.initialized.value = Uint64(1)
    emit<StablecoinControllerInitializedEvent>({
      admin: Txn.sender,
      protocolManagerAppId,
      stableAssetId,
      supplyCeilingMicroStable,
    })
  }

  /** Read stablecoin controller state. */
  @readonly
  public readStablecoinControlState(): StablecoinControlState {
    return {
      admin: this.admin.value,
      initialized: this.initialized.value,
      protocolManagerAppId: this.protocolManagerAppId.value,
      stableAssetId: this.stableAssetId.value,
      issuedSupplyMicroStable: this.issuedSupplyMicroStable.value,
      supplyCeilingMicroStable: this.supplyCeilingMicroStable.value,
      pauseFlags: this.pauseFlags.value,
    }
  }

  /** Admin-only controller configuration update. */
  public adminSetStablecoinConfig(
    protocolManagerAppId: uint64,
    stableAssetId: uint64,
    supplyCeilingMicroStable: uint64
  ): void {
    this.assertReady()
    this.assertAdmin()
    this.validateConfig(protocolManagerAppId, supplyCeilingMicroStable)
    assert(this.issuedSupplyMicroStable.value <= supplyCeilingMicroStable, 'ceiling below supply')
    this.protocolManagerAppId.value = protocolManagerAppId
    this.stableAssetId.value = stableAssetId
    this.supplyCeilingMicroStable.value = supplyCeilingMicroStable
    emit('StablecoinConfigUpdated', Txn.sender, protocolManagerAppId, stableAssetId, supplyCeilingMicroStable)
  }

  /** Admin-only replacement of stablecoin control pause flags. */
  public adminSetPauseFlags(pauseFlags: uint64): void {
    this.assertReady()
    this.assertAdmin()
    this.pauseFlags.value = pauseFlags
    emit('StablecoinPauseFlagsUpdated', Txn.sender, pauseFlags)
  }

  /**
   * Opts the app account into the stable ASA so it can hold mint reserves.
   * The app account must be pre-funded for the ASA opt-in MBR and inner fee.
   */
  public optInToStableAsset(): void {
    this.assertReady()
    this.assertAdmin()
    assert(this.stableAssetId.value > Uint64(0), 'stable asset required')
    const stableAsset = Asset(this.stableAssetId.value)
    itxn
      .assetTransfer({
        xferAsset: stableAsset,
        assetReceiver: Global.currentApplicationAddress,
        assetAmount: Uint64(0),
        fee: Uint64(0),
      })
      .submit()
    emit<StablecoinAssetOptedInEvent>({
      admin: Txn.sender,
      stableAssetId: this.stableAssetId.value,
    })
  }

  /** Manager-authorized reserve transfer to a vault owner. */
  public mintForVault(vaultId: uint64, receiver: Account, amountMicroStable: uint64): void {
    this.assertReady()
    this.assertManagerCaller()
    this.assertNotPaused(PAUSE_MINT)
    assert(receiver !== Global.zeroAddress, 'receiver required')
    assert(vaultId > Uint64(0), 'vault id required')
    assert(amountMicroStable > Uint64(0), 'zero mint')
    assert(this.stableAssetId.value > Uint64(0), 'stable asset required')

    const newIssuedSupply = safeAdd(this.issuedSupplyMicroStable.value, amountMicroStable)
    assert(newIssuedSupply <= this.supplyCeilingMicroStable.value, 'ceiling exceeded')

    const stableAsset = Asset(this.stableAssetId.value)
    assert(receiver.isOptedIn(stableAsset), 'receiver asset opt-in required')
    assert(stableAsset.balance(Global.currentApplicationAddress) >= amountMicroStable, 'stable reserve insufficient')

    itxn
      .assetTransfer({
        xferAsset: stableAsset,
        assetReceiver: receiver,
        assetAmount: amountMicroStable,
        fee: Uint64(0),
      })
      .submit()

    this.issuedSupplyMicroStable.value = newIssuedSupply
    emit<StablecoinMintedForVaultEvent>({
      vaultId,
      receiver,
      amountMicroStable,
      issuedSupplyMicroStable: newIssuedSupply,
    })
  }

  /**
   * Manager-authorized repayment accounting.
   *
   * The protocol manager validates the grouped user ASA transfer into this app
   * before calling this method. The ASA units are retired by returning them to
   * the controller reserve and decrementing issued protocol supply.
   */
  public burnForVault(vaultId: uint64, amountMicroStable: uint64): void {
    this.assertReady()
    this.assertManagerCaller()
    this.assertNotPaused(PAUSE_BURN)
    assert(vaultId > Uint64(0), 'vault id required')
    assert(amountMicroStable > Uint64(0), 'zero burn')
    assert(this.stableAssetId.value > Uint64(0), 'stable asset required')
    assert(amountMicroStable <= this.issuedSupplyMicroStable.value, 'burn exceeds issued')

    const newIssuedSupply = safeSub(this.issuedSupplyMicroStable.value, amountMicroStable)
    this.issuedSupplyMicroStable.value = newIssuedSupply
    emit<StablecoinRetiredForVaultEvent>({
      vaultId,
      amountMicroStable,
      issuedSupplyMicroStable: newIssuedSupply,
    })
  }

  private assertReady(): void {
    assert(this.initialized.value === Uint64(1), 'stablecoin controller not initialized')
  }

  private assertAdmin(): void {
    assert(Txn.sender === this.admin.value, 'admin only')
  }

  private assertManagerCaller(): void {
    assert(Global.callerApplicationId === this.protocolManagerAppId.value, 'manager app only')
    const managerApp = Application(this.protocolManagerAppId.value)
    assert(Txn.sender === managerApp.address, 'manager sender mismatch')
  }

  private assertNotPaused(flag: uint64): void {
    const active: uint64 = this.pauseFlags.value & flag
    assert(active === Uint64(0), 'stablecoin paused')
  }

  private validateConfig(protocolManagerAppId: uint64, supplyCeilingMicroStable: uint64): void {
    assert(protocolManagerAppId > Uint64(0), 'manager app required')
    assert(supplyCeilingMicroStable > Uint64(0), 'ceiling required')
  }
}
