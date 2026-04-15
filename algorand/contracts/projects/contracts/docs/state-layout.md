# CollateralX Smart Contract State Layout

This document defines the initial on-chain architecture for the CollateralX
stablecoin protocol. It is intentionally explicit because state layout is the
part of an Algorand application that is hardest to change safely after launch.

## Contract Topology

CollateralX is split into four Algorand TypeScript applications:

| Contract | Responsibility |
| --- | --- |
| `CollateralXProtocolManager` | Owns protocol configuration, aggregate counters, and per-vault records. |
| `CollateralXOracleAdapter` | Stores the canonical ALGO/USD oracle sample consumed by protocol actions. |
| `CollateralXStablecoinController` | Owns stablecoin asset-control configuration and future mint/burn authorization. |
| `CollateralXLiquidationExecutor` | Owns liquidation execution configuration and future keeper-facing liquidation calls. |

The protocol manager is the source of truth for vault data. The other contracts
are intentionally small adapters/controllers so future versions can replace the
oracle, stablecoin controller, or liquidation executor without migrating every
vault box.

## Global State

Global state is used only for bounded protocol-wide values that are required on
nearly every call. This keeps reads cheap and avoids scanning boxes for aggregate
state.

### Protocol Manager Globals

| Key | Type | Reason |
| --- | --- | --- |
| `adm` | `Account` | Admin address used for access control. Global because every privileged method needs it. |
| `init` | `uint64` | One-way initialization guard. Global because it gates all state-changing methods. |
| `nvid` | `uint64` | Next deterministic vault id. Global because ids must be unique and sequential. |
| `vcnt` | `uint64` | Total vaults ever created. Global counter for analytics and keeper pagination. |
| `tdbt` | `uint64` | Aggregate stablecoin debt in micro-units. Global because protocol ceiling checks need O(1) reads. |
| `tcol` | `uint64` | Aggregate collateral in microALGO. Global because dashboard and risk checks need O(1) reads. |
| `mcr` | `uint64` | Minimum collateral ratio in basis points. Global protocol parameter. |
| `lqr` | `uint64` | Liquidation threshold in basis points. Global protocol parameter. |
| `lpn` | `uint64` | Liquidation penalty in basis points. Global protocol parameter. |
| `lbn` | `uint64` | Liquidation bonus in basis points. Global protocol parameter. |
| `ofw` | `uint64` | Oracle freshness window in seconds. Global protocol parameter. |
| `vmcp` | `uint64` | Per-vault mint cap in micro stable units. Global protocol parameter. |
| `pdc` | `uint64` | Protocol debt ceiling in micro stable units. Global protocol parameter. |
| `dflo` | `uint64` | Minimum remaining debt floor in micro stable units. Global protocol parameter. |
| `pflg` | `uint64` | Pause bitmask for selected actions. Global because every action checks it. |
| `oapp` | `uint64` | Oracle adapter app id. Global integration pointer. |
| `sapp` | `uint64` | Stablecoin controller app id. Global integration pointer. |
| `lapp` | `uint64` | Liquidation executor app id. Global integration pointer. |

Pause flag bits:

| Bit | Mask | Action |
| --- | --- | --- |
| 0 | `1` | Deposits paused |
| 1 | `2` | Minting paused |
| 2 | `4` | Repayment paused |
| 3 | `8` | Withdrawals paused |
| 4 | `16` | Liquidations paused |
| 5 | `32` | Vault creation paused |
| 6 | `64` | Emergency pause for all user operations |

### Oracle Adapter Globals

| Key | Type | Reason |
| --- | --- | --- |
| `adm` | `Account` | Admin authorized to update adapter configuration. |
| `init` | `uint64` | Initialization guard. |
| `px` | `uint64` | Current ALGO/USD price in microUSD. Global because every consumer needs the latest value. |
| `upd` | `uint64` | UNIX timestamp for the current oracle sample. |
| `src` | `bytes` | Short source tag, such as `manual-v0` or an oracle feed id. |
| `maxa` | `uint64` | Maximum permitted sample age in seconds for adapter-level checks. |
| `pflg` | `uint64` | Pause bitmask for adapter updates/reads if governance needs to freeze the feed. |

### Stablecoin Controller Globals

| Key | Type | Reason |
| --- | --- | --- |
| `adm` | `Account` | Admin authorized to configure controller. |
| `init` | `uint64` | Initialization guard. |
| `mgr` | `uint64` | Protocol manager app id authorized for future mint/burn calls. |
| `asa` | `uint64` | Stablecoin ASA id once created or attached. |
| `supply` | `uint64` | Aggregate issued supply controlled by this app. |
| `ceil` | `uint64` | Supply ceiling in micro stable units. |
| `pflg` | `uint64` | Pause bitmask for future mint/burn/control actions. |

### Liquidation Executor Globals

| Key | Type | Reason |
| --- | --- | --- |
| `adm` | `Account` | Admin authorized to configure executor. |
| `init` | `uint64` | Initialization guard. |
| `mgr` | `uint64` | Protocol manager app id whose vaults can be liquidated. |
| `keeper` | `Account` | Optional keeper account. Zero address means permissionless execution in future phases. |
| `pflg` | `uint64` | Pause bitmask for future liquidation execution. |

## Box State

Boxes are used for per-vault records because vault count is unbounded and global
state is capped at 64 key-value pairs. Local state is not used in this phase:
vault ownership is stored directly in the vault box, so users do not need to
opt in before receiving or operating a vault.

### Vault BoxMap

| Item | Value |
| --- | --- |
| Prefix | `v` |
| Key type | `uint64` vault id |
| Full box name | `Bytes("v").concat(Bytes(vaultId, { length: 8 }))` |
| Value type | `VaultRecord` |

`VaultRecord` schema:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | `uint64` | Deterministic vault id. |
| `owner` | `Account` | Vault owner. |
| `collateralMicroAlgo` | `uint64` | ALGO collateral held by the protocol, in microALGO. |
| `debtMicroStable` | `uint64` | Stablecoin debt, in micro stable units. |
| `createdAt` | `uint64` | Creation timestamp from `Global.latestTimestamp`. |
| `updatedAt` | `uint64` | Last state-changing timestamp. |
| `status` | `uint64` | Lifecycle code: `1 = active`, `2 = closing`, `3 = closed`, `4 = liquidating`. |
| `version` | `uint64` | Record schema version. Starts at `1`. |

### Owner Vault Index BoxMap

| Item | Value |
| --- | --- |
| Prefix | `o` |
| Key type | `{ owner: Account; vaultId: uint64 }` |
| Value type | `uint64` set to `1` |

The owner index is intentionally append-only for discovery. It lets frontends
and keepers discover a user's vault ids by scanning boxes with prefix `o` and
the owner's address in the encoded key. It duplicates a small amount of data to
avoid local state opt-in and to avoid requiring a dynamic array in one large box.

## Deterministic Vault IDs

Vault ids are allocated by the protocol manager from `nvid`, starting at `1`.
`createVault()` writes the vault box under `v + uint64_be(id)`, writes the owner
index under `o + owner + uint64_be(id)`, then increments `nvid` and `vcnt`.

This is deterministic because the id depends only on prior protocol state. It is
also indexer-friendly because vault ids are compact and monotonic.

## Box Minimum Balance Requirements

Box storage increases the application account's minimum balance requirement
before the box can be created. The protocol app account must be funded in advance
by the deployer, treasury, or a grouped payment in a future `createVault` flow.

Formula:

```text
MBR increase = 2_500 + 400 * (box_name_length + box_value_length) microALGO
```

Implications for this layout:

| Box | Name Size | Value Shape | MBR Impact |
| --- | ---: | --- | --- |
| Vault record | `1 + 8 = 9` bytes | Fixed-size encoded `VaultRecord` | App pays per vault. |
| Owner index | Prefix + encoded owner + id | Single `uint64` | App pays a second small index box per vault. |

The app must also include box references in calls that read or write vaults.
Each box reference provides 1 KiB of box I/O budget, and budget is shared across
the transaction group. The current fixed vault record is intentionally small so
one reference per vault box is enough.

## Frontend And Keeper Discovery

Frontends and keepers should discover state in layers:

1. Read protocol manager globals for counters, params, integration app ids, and
   aggregate TVL/debt.
2. Scan boxes with prefix `v` to enumerate all vault records.
3. Scan boxes with prefix `o` plus an owner address to enumerate a wallet's vaults.
4. Read oracle adapter globals for the latest price sample and freshness data.
5. Read stablecoin/liquidation controller globals for integration status.

For direct app calls, generated typed clients should pass required box references.
For exploratory reads, an indexer or SDK box query can fetch by prefix without an
ABI call.

## Upgrade And Extensibility

The first vault schema includes `version` so future contracts can branch on box
record format if migration becomes necessary. New per-vault fields should prefer
one of these paths:

1. Add a new sidecar BoxMap keyed by vault id when the field is sparse or large.
2. Add a `VaultRecordV2` and migration method when every vault needs the field.
3. Store protocol-wide additions in new global keys only when the value is
   bounded and frequently read.

The manager stores oracle, stablecoin, and liquidation app ids as integration
pointers so those modules can be replaced by governance without rewriting vault
records. Future app updates must preserve existing global keys and box prefixes
unless a dedicated migration method is shipped and tested.
