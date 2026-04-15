# Oracle Trust Model

CollateralX v1 uses a simple trusted-updater oracle adapter. The goal is to keep
vault logic independent from a specific oracle provider while still enforcing
freshness, source tagging, update authorization, and circuit breakers on-chain.

## Data Model

The oracle adapter stores the latest ALGO/USD sample in global state:

| Key | Value | Purpose |
| --- | --- | --- |
| `px` | ALGO price in microUSD | Used by mint, withdraw, and liquidation math. |
| `upd` | UNIX timestamp | Timestamp freshness check. |
| `urnd` | Algorand round | Rejects future rounds and non-monotonic updates. |
| `src` | Source identifier bytes | Human/auditor-readable source tag, such as `manual:localnet` or a future provider id. |
| `maxa` | Max age in seconds | Adapter-level freshness window. |
| `pflg` | Pause bitmask | Circuit breaker for updates or reads. |
| `adm` | Admin account | Governance/admin authority for configuration and updater rotation. |
| `updr` | Trusted updater account | Only account allowed to submit v1 price updates. |

The protocol manager also has its own `oracleFreshnessWindowSeconds` parameter.
Vault actions must pass both checks:

```text
Global.latestTimestamp - oracle.updatedAt <= oracle.maxAgeSeconds
Global.latestTimestamp - oracle.updatedAt <= protocol.oracleFreshnessWindowSeconds
oracle.updatedRound <= Global.round
oracle.price > 0
oracle reads not paused
```

This dual-window setup lets governance make the protocol stricter than the
adapter without redeploying the oracle app.

## Authorization

`createApplication(admin)` sets both `adm` and `updr` to the bootstrap admin.
After initialization, governance can call `adminSetUpdater(newUpdater)` to rotate
the trusted updater.

Only `updr` can call `updatePrice`. Admin configuration methods are separate so
operational update keys can be hot while the admin/governance key remains colder.

## Update Validation

Every update must satisfy:

| Rule | Rejection |
| --- | --- |
| Price is non-zero | `price required` |
| Timestamp is non-zero and not in the future | `timestamp required`, `timestamp future` |
| Round is non-zero and not in the future | `round required`, `round future` |
| Source is present and at most 64 bytes | `source required`, `source too long` |
| Sample is fresh for adapter max age at submission time | `price stale` |
| Round strictly increases | `round not newer` |
| Timestamp does not regress | `timestamp regressed` |
| Updates are not paused | `oracle paused` |

The adapter records the source tag but does not verify off-chain signatures or
aggregated provider proofs in v1. That is the main MVP trust assumption.

## Circuit Breakers

Pause flags:

| Mask | Meaning |
| ---: | --- |
| `1` | Pause updates. Current sample can still be read. |
| `2` | Pause reads. Protocol vault actions reject with `oracle reads paused`. |

Invalid or missing values also behave as circuit breakers. The protocol adapter
helper rejects missing globals, zero price, zero timestamp, zero round, future
timestamp, future round, stale age, and read pause before any vault action can
mint or withdraw against the sample.

## Protocol Interface

Vault actions consume oracle data through
`smart_contracts/collateralx_shared/oracle_adapter.algo.ts`. That helper defines
the adapter global keys and freshness rules. The protocol manager stores only
the oracle app id in global state and calls the shared helper when it needs a
fresh price.

This keeps price logic out of individual vault methods:

```text
vault action -> readFreshOracleAdapter(oracleApp, protocolFreshnessWindow)
             -> shared key reads and freshness checks
             -> health/mint math
```

The current interface is intentionally small: `px`, `upd`, `urnd`, `maxa`, and
`pflg`. Frontends can call `readOraclePrice()` for a raw sample with `isFresh`,
or `readFreshOraclePrice()` to get adapter-level stale rejection.

## Frontend And Keeper Usage

Frontends should:

1. Call `readOraclePrice()` to display the latest sample, source tag, updater,
   timestamp, round, and `isFresh`.
2. Treat `isFresh = false` or read-pause failures as a blocking state for mint
   and debt-bearing withdrawals.
3. Use `readMaxMintable(vaultId)` for user-facing mint previews because it runs
   the same protocol freshness checks as `mintStablecoin`.

Keepers should:

1. Watch `OracleUpdatedEvent` and `OraclePauseFlagsUpdated` logs.
2. Reconcile latest global state before liquidating or previewing liquidation.
3. Stop risk actions when oracle reads are paused or stale.

## Migration Path

The next oracle version can become more decentralized without changing vault box
state:

1. Deploy a provider adapter that preserves the same global interface
   (`px`, `upd`, `urnd`, `maxa`, `pflg`) but verifies signed reports,
   threshold signatures, a committee multisig, or a cross-chain proof.
2. Use `adminSetIntegrations` on the protocol manager to point `oapp` to the new
   adapter app id.
3. Keep the old adapter live briefly for indexers and audits, then freeze reads
   or updates once migration is complete.
4. If a future provider needs a different state model, upgrade only
   `collateralx_shared/oracle_adapter.algo.ts` and the protocol manager approval
   program; vault boxes remain unchanged because they do not embed oracle data.

For mainnet-grade deployment, v1’s single updater should be replaced by a
multisig-controlled updater at minimum, and preferably by an adapter that
verifies independent provider attestations on-chain.
