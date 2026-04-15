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
  type uint64,
} from '@algorandfoundation/algorand-typescript'
import { abimethod } from '@algorandfoundation/algorand-typescript/arc4'

const PAUSE_EXECUTION: uint64 = Uint64(1)

export type LiquidationExecutorState = {
  admin: Account
  initialized: uint64
  protocolManagerAppId: uint64
  keeper: Account
  pauseFlags: uint64
}

type LiquidationExecutorInitializedEvent = {
  admin: Account
  protocolManagerAppId: uint64
  keeper: Account
}

type LiquidationAuthorizationEvent = {
  keeper: Account
  vaultId: uint64
  repaymentMicroStable: uint64
  protocolManagerAppId: uint64
}

/**
 * Liquidation executor policy registry.
 *
 * Safety-critical assumption: v1 liquidation settlement is implemented by
 * CollateralXProtocolManager.liquidate so repayment validation, debt burn, and
 * collateral payouts are atomic in one app. This optional app only records and
 * enforces keeper policy for future routing without touching funds.
 */
export class CollateralXLiquidationExecutor extends Contract {
  admin = GlobalState<Account>({ key: 'adm' })
  initialized = GlobalState<uint64>({ key: 'init', initialValue: Uint64(0) })
  protocolManagerAppId = GlobalState<uint64>({ key: 'mgr', initialValue: Uint64(0) })
  keeper = GlobalState<Account>({ key: 'keeper' })
  pauseFlags = GlobalState<uint64>({ key: 'pflg', initialValue: Uint64(0) })

  @abimethod({ onCreate: 'require' })
  public createApplication(admin: Account): void {
    assert(admin !== Global.zeroAddress, 'admin required')
    this.admin.value = admin
    emit('LiquidationAdminCreated', admin)
  }

  /** One-time liquidation executor initialization by admin. */
  public initializeLiquidationExecutor(protocolManagerAppId: uint64, keeper: Account): void {
    this.assertAdmin()
    assert(this.initialized.value === Uint64(0), 'already initialized')
    assert(protocolManagerAppId > Uint64(0), 'manager app required')
    this.protocolManagerAppId.value = protocolManagerAppId
    this.keeper.value = keeper
    this.initialized.value = Uint64(1)
    emit<LiquidationExecutorInitializedEvent>({ admin: Txn.sender, protocolManagerAppId, keeper })
  }

  /** Read executor policy state. */
  @readonly
  public readLiquidationExecutorState(): LiquidationExecutorState {
    return {
      admin: this.admin.value,
      initialized: this.initialized.value,
      protocolManagerAppId: this.protocolManagerAppId.value,
      keeper: this.keeper.value,
      pauseFlags: this.pauseFlags.value,
    }
  }

  /** Admin-only executor configuration update. */
  public adminSetLiquidationConfig(protocolManagerAppId: uint64, keeper: Account): void {
    this.assertReady()
    this.assertAdmin()
    assert(protocolManagerAppId > Uint64(0), 'manager app required')
    this.protocolManagerAppId.value = protocolManagerAppId
    this.keeper.value = keeper
    emit('LiquidationConfigUpdated', Txn.sender, protocolManagerAppId, keeper)
  }

  /** Admin-only replacement of liquidation pause flags. */
  public adminSetPauseFlags(pauseFlags: uint64): void {
    this.assertReady()
    this.assertAdmin()
    this.pauseFlags.value = pauseFlags
    emit('LiquidationPauseFlagsUpdated', Txn.sender, pauseFlags)
  }

  /**
   * Keeper policy check for off-chain routing.
   *
   * This method intentionally does not move collateral or retire debt. v1
   * settlement must call `CollateralXProtocolManager.liquidate` directly so the
   * manager can inspect the exact grouped repayment transfer and mutate vault
   * boxes atomically.
   */
  public authorizeLiquidation(vaultId: uint64, repaymentMicroStable: uint64): void {
    this.assertReady()
    this.assertNotPaused(PAUSE_EXECUTION)
    this.assertKeeperIfConfigured()
    assert(vaultId > Uint64(0), 'vault id required')
    assert(repaymentMicroStable > Uint64(0), 'zero repayment')
    emit<LiquidationAuthorizationEvent>({
      keeper: Txn.sender,
      vaultId,
      repaymentMicroStable,
      protocolManagerAppId: this.protocolManagerAppId.value,
    })
  }

  private assertReady(): void {
    assert(this.initialized.value === Uint64(1), 'liquidation executor not initialized')
  }

  private assertAdmin(): void {
    assert(Txn.sender === this.admin.value, 'admin only')
  }

  private assertNotPaused(flag: uint64): void {
    const active: uint64 = this.pauseFlags.value & flag
    assert(active === Uint64(0), 'liquidation paused')
  }

  private assertKeeperIfConfigured(): void {
    if (this.keeper.value !== Global.zeroAddress) {
      assert(Txn.sender === this.keeper.value, 'keeper only')
    }
  }
}
