# CollateralX Protocol Specification

This specification describes the implemented overcollateralized stablecoin flow
for the current Algorand contracts. It should be read together with
`docs/state-layout.md`, which is the canonical state-layout reference.

## Units

| Value | Unit |
| --- | --- |
| ALGO collateral | microALGO, where `1 ALGO = 1_000_000 microALGO` |
| Stablecoin debt and supply | micro stable units, where `1 cxUSD = 1_000_000` |
| Oracle price | microUSD per ALGO |
| Ratios | basis points, where `10_000 = 100%` |
| Time | UNIX seconds from `Global.latestTimestamp` and oracle samples |

## Contracts

| Contract | Role |
| --- | --- |
| `CollateralXProtocolManager` | Canonical vault storage, protocol configuration, aggregate debt/collateral counters, user actions. |
| `CollateralXOracleAdapter` | Current ALGO/USD oracle sample, sample timestamp, max age, source tag, and read/update pause flags. |
| `CollateralXStablecoinController` | Stablecoin ASA reserve controller, issued-supply accounting, protocol-gated mint/retire methods. |
| `CollateralXLiquidationExecutor` | Liquidation configuration shell for the later keeper phase. |

## State Placement

Protocol-wide configuration and aggregate counters live in global state because
every economic action needs them in O(1) reads:

| Global | Reason |
| --- | --- |
| `adm`, `init`, `pflg` | Access control, initialization, and pause checks are required by all privileged or user-facing calls. |
| `nvid`, `vcnt` | Deterministic vault id allocation and created-vault reconciliation. |
| `tdbt`, `tcol` | Aggregate accounting used for debt ceiling enforcement and dashboard reads. |
| `mcr`, `lqr`, `lpn`, `lbn`, `ofw`, `vmcp`, `pdc`, `dflo` | Risk parameters required by mint, repay, withdraw, and liquidation flows. |
| `oapp`, `sapp`, `lapp` | Replaceable integration pointers for oracle, stablecoin controller, and liquidation executor. |

Per-vault state lives in boxes because vault count is unbounded and global state
is capped. Local state is intentionally unused: users do not need to opt in to
the protocol manager before creating or operating vaults.

| BoxMap | Key | Value | Reason |
| --- | --- | --- | --- |
| `vaults` | `v || uint64_be(vaultId)` | `VaultRecord` | Canonical collateral, debt, owner, timestamps, lifecycle status, schema version. |
| `ownerVaults` | `o || ownerAddress || uint64_be(vaultId)` | `uint64(1)` | Active-vault discovery by owner without local state or a dynamic array. |

Closed vault cleanup is explicit: both the vault box and owner-index box are
deleted. Historical discovery therefore relies on ARC-28 events or archival
indexer data, while current active discovery uses live boxes.

## Deterministic Vault IDs

`createVault()` allocates ids from `nvid`, starting at `1`. The id is
deterministic because it depends only on prior protocol state. The method writes:

| Write | Value |
| --- | --- |
| `vaults[nvid]` | Empty active `VaultRecord` owned by `Txn.sender`. |
| `ownerVaults[{ Txn.sender, nvid }]` | `1`, marking an active owner-vault relationship. |
| `nvid` | Incremented by `1`. |
| `vcnt` | Incremented by `1`; this is total-created, not currently-open. |

## Minimum Balance

Box storage increases the protocol app account minimum balance requirement:

```text
box_mbr_microalgo = 2_500 + 400 * (box_name_length + box_value_length)
```

Each vault currently creates two boxes. The protocol app account must hold
enough ALGO for app MBR, vault box MBR, owner-index box MBR, and execution fee
buffer before vault creation or close/withdraw operations. Close and full
debt-free withdrawal delete both boxes, which releases their MBR back to the app
account before returning user collateral.

The stablecoin controller also needs MBR for its ASA opt-in. Repayment returns
ASA units to that controller account, so its reserve balance increases while its
`supply` global decreases.

## Implemented User Flows

### Initialize Protocol

`initializeProtocol(...)void` is admin-only and one-time. It validates all risk
params, stores integration app ids, and sets `init = 1`.

Primary rejection messages:

| Message | Condition |
| --- | --- |
| `admin only` | Non-admin caller. |
| `already initialized` | Protocol has already been initialized. |
| `min ratio too low` | Minimum collateral ratio below `10_000 bps`. |
| `liquidation ratio above min` | Liquidation threshold above minimum collateral ratio. |
| `oracle window required` | Freshness window is zero. |
| `vault cap required` | Per-vault mint cap is zero. |
| `ceiling below vault cap` | Protocol debt ceiling below per-vault cap. |
| `debt floor too high` | Debt floor above vault mint cap. |

### Deposit Collateral

`depositCollateral(pay,uint64)void` requires a two-transaction group:

| Index | Transaction |
| ---: | --- |
| `0` | Payment from vault owner to protocol app address. |
| `1` | Protocol app call with the payment as ARC-4 transaction argument. |

The protocol validates group size, group indices, owner, receiver, no rekey, no
close-out, and positive payment amount before increasing vault collateral and
`tcol`.

### Mint Stablecoin

`mintStablecoin(uint64,uint64)void` is a single protocol app call. It reads the
vault, oracle adapter, and stablecoin controller. Minting succeeds only when the
post-mint vault is healthy, the oracle is fresh, the per-vault cap is not
exceeded, the protocol debt ceiling is not exceeded, and the stablecoin
controller supply ceiling is not exceeded.

Stablecoin control is protocol-gated: the protocol manager performs an inner
app call to `mintForVault`, and the controller verifies
`Global.callerApplicationId` plus the sender app address before moving reserve
ASA units to the vault owner.

### Repay Stablecoin

`repay(axfer,uint64)void` requires a two-transaction group:

| Index | Transaction |
| ---: | --- |
| `0` | Stablecoin ASA transfer from vault owner to stablecoin controller app address. |
| `1` | Protocol app call with the asset transfer as ARC-4 transaction argument. |

The protocol validates:

| Check | Error |
| --- | --- |
| Group size is exactly `2` | `repay group size` |
| ASA transfer is group index `0` | `repay transfer index` |
| App call is group index `1` | `repay app call index` |
| Transfer sender is vault owner and app caller | `repay sender mismatch` or `vault owner only` |
| Transfer receiver is stablecoin controller app address | `repay receiver mismatch` |
| Transfer asset is configured stablecoin ASA | `repay asset mismatch` |
| No rekey or asset close-out | `repay rekey forbidden`, `repay close forbidden` |
| Amount is positive and not above debt | `zero repay`, `repay exceeds debt` |
| Remaining debt is either zero or at least `dflo` | `debt below floor` |

After checks pass, the protocol calls `burnForVault` on the stablecoin
controller. This retires supply accounting by decrementing `supply`. The ASA
units already returned to the controller reserve in the outer group, so the
auditable invariant is:

```text
issuedSupplyMicroStable' = issuedSupplyMicroStable - repaymentAmount
vault.debtMicroStable' = vault.debtMicroStable - repaymentAmount
totalDebtMicroStable' = totalDebtMicroStable - repaymentAmount
```

### Withdraw Collateral

`withdrawCollateral(uint64,uint64)void` is a single protocol app call. It
validates owner, active vault, positive amount, and sufficient collateral.

If debt remains, the protocol reads the oracle and checks post-action health:

```text
postCollateralValue / existingDebt >= minCollateralRatio
```

Debt-free withdrawals do not require an oracle read. If a debt-free withdrawal
reduces collateral to zero, the vault box and owner-index box are deleted and
`VaultClosedEvent` is emitted in the same transaction.

Primary rejection messages:

| Message | Condition |
| --- | --- |
| `withdraw group size` | Not a single outer app call. |
| `action paused` | Withdraw pause flag is active. |
| `zero withdraw` | Withdrawal amount is zero. |
| `vault owner only` | Caller is not the vault owner. |
| `withdraw exceeds collateral` | Requested amount exceeds vault collateral. |
| `oracle stale` | Debt-bearing withdrawal uses stale oracle data. |
| `withdraw unhealthy` | Post-withdraw collateral ratio is below `mcr`. |

### Close Vault

`closeVault(uint64)void` is a single protocol app call for explicit debt-free
closure. It requires `debtMicroStable == 0`, deletes both vault boxes, returns
all remaining collateral through an inner payment, updates `tcol`, and emits
`VaultClosedEvent`.

Primary rejection messages:

| Message | Condition |
| --- | --- |
| `close group size` | Not a single outer app call. |
| `action paused` | Withdraw pause flag is active. |
| `vault owner only` | Caller is not the vault owner. |
| `debt not zero` | Vault still has outstanding debt. |
| `vault cleanup missing` | Vault box was not supplied or could not be deleted. |
| `owner index cleanup missing` | Owner-index box was not supplied or could not be deleted. |

## Pause Flags

Protocol manager pause flags:

| Mask | Action |
| ---: | --- |
| `1` | Deposit |
| `2` | Mint |
| `4` | Repay |
| `8` | Withdraw and close |
| `16` | Liquidate |
| `32` | Create vault |
| `64` | Emergency pause for all user operations |

The stablecoin controller has independent mint and burn pause flags. A protocol
repay can therefore fail either because protocol repayment is paused or because
controller retirement is paused.

## Discovery

Frontends should:

1. Call `readProtocolStatus()` to discover integration ids, pause flags, and
   aggregate counters.
2. Scan `ownerVaults` boxes with prefix `o || ownerAddress` to list currently
   active vault ids for a wallet.
3. Call `readVault(vaultId)` with the vault box reference for each active vault.
4. Use `readMaxMintable(vaultId)` with oracle and stablecoin app references for
   mint previews.

Keepers should:

1. Watch `VaultCreatedEvent`, `StablecoinMintedEvent`,
   `StablecoinRepaidEvent`, `CollateralWithdrawnEvent`, and `VaultClosedEvent`.
2. Reconcile current active vaults by scanning `v` boxes.
3. Treat `vcnt` as total created and live vault boxes as currently open.
4. Stop keeper actions affected by `ProtocolPauseFlagsUpdatedEvent`.

## Upgrade Considerations

The current `VaultRecord` includes `version = 1`. Future schema additions should
prefer sidecar boxes keyed by vault id for sparse or optional data. If every
vault must migrate, ship an explicit migration method that preserves the `v` and
`o` prefixes or emits a complete migration event stream for indexers.

Integration ids are global pointers, so governance can replace oracle,
stablecoin, or liquidation apps without migrating vault boxes. Any replacement
must preserve the stablecoin controller authorization model and supply/debt
accounting invariants.
