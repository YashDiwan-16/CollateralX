# CollateralX Off-chain Services Runbook

## Services

The `services` package contains four operational pieces:

- Keeper scanner: reads protocol state, evaluates vault health, and creates liquidation jobs.
- Liquidation executor: submits full liquidation transactions only when dry-run is disabled and execution is explicitly enabled.
- Oracle updater: reads a configured price source and calls the trusted updater adapter.
- Read API/indexer: builds frontend-friendly read models for summaries, vaults, user history, liquidations, and oracle history.

Pure calculations live under `src/domain`. Algorand network calls live under `src/chain`. Keeper, oracle, and read API orchestration depend on interfaces, so they can be tested with mock chain clients.

## Setup

```bash
cd services
pnpm install
cp .env.example .env
```

Set deployed app ids and LocalNet endpoints in `.env`:

```bash
PROTOCOL_APP_ID=<protocol-manager-app-id>
ORACLE_APP_ID=<oracle-adapter-app-id>
STABLECOIN_APP_ID=<stablecoin-controller-app-id>
LIQUIDATION_APP_ID=<liquidation-executor-app-id>
```

For LocalNet, the contract package now includes a bootstrap helper that deploys
all protocol apps, creates the stablecoin ASA reserve, initializes cross-app
config, and creates dedicated `KEEPER` / `ORACLE_UPDATER` accounts:

```bash
cd ../algorand/contracts/projects/contracts
pnpm bootstrap:localnet
```

Use the resulting app ids and operator account values to populate
[`services/.env`](/Users/yashdiwan/Desktop/CollateralX/services/.env),
[`frontend/.env`](/Users/yashdiwan/Desktop/CollateralX/frontend/.env), and the
contract package's LocalNet deploy env if you want repeatable `algokit project deploy localnet`
runs.

For TestNet, create a local `.env.testnet` in the contracts package with at
least `DEPLOYER_MNEMONIC`. If `KEEPER_MNEMONIC` or `ORACLE_UPDATER_MNEMONIC`
are omitted, the bootstrap helper safely falls back to the deployer account for
those roles:

```bash
cd ../algorand/contracts/projects/contracts
DOTENV_CONFIG_PATH=.env.testnet pnpm bootstrap:testnet
```

After deployment, copy the returned app ids plus the chosen operator address
into [`services/.env`](/Users/yashdiwan/Desktop/CollateralX/services/.env) and
[`frontend/.env`](/Users/yashdiwan/Desktop/CollateralX/frontend/.env), and set
their network/endpoints to TestNet.

## Keeper Safety Defaults

The keeper is safe by default:

- `KEEPER_DRY_RUN=true`
- `KEEPER_EXECUTION_ENABLED=false`
- `KEEPER_MAX_LIQUIDATIONS_PER_RUN=1`
- `KEEPER_MIN_LIQUIDATION_GAP_BPS=25`

To execute liquidations, operators must set both:

```bash
KEEPER_DRY_RUN=false
KEEPER_EXECUTION_ENABLED=true
KEEPER_MNEMONIC="<funded liquidator account mnemonic>"
```

The job store at `KEEPER_JOB_STATE_PATH` makes liquidation jobs idempotent by keying them as `liquidate:<vaultId>:round:<oracleRound>`.

## Commands

```bash
pnpm keeper:once
pnpm keeper:loop
pnpm oracle:update
pnpm read-api
```

The read API serves:

- `GET /health`
- `GET /v1/protocol/summary`
- `GET /v1/vaults`
- `GET /v1/users/:address/vaults`
- `GET /v1/users/:address/history`
- `GET /v1/liquidations`
- `GET /v1/liquidations/history`
- `GET /v1/oracle/history`

For deployment platforms that inject a dynamic web port, the read API also
honors the standard `PORT` environment variable when `READ_API_PORT` is unset.

## Oracle Updates

Static source:

```bash
ORACLE_SOURCE_KIND=static
ORACLE_STATIC_PRICE_MICRO_USD=381200
ORACLE_SOURCE_ID=trusted-updater:v1
```

HTTP source expects JSON with `pricePerAlgoMicroUsd` or `price`, and optional `updatedAt`, `updatedRound`, and `source`.

Large deviations are rejected by `ORACLE_MAX_DEVIATION_BPS` unless operators deliberately increase the guardrail.

## Observability

Logs are structured JSON via `JsonConsoleLogger`. Metrics are emitted through a `MetricsSink` interface so production deployments can plug in StatsD, OpenTelemetry, or Prometheus adapters without changing keeper/read logic.

Important metric names:

- `keeper.vaults_scanned`
- `keeper.candidates`
- `keeper.liquidations_dry_run`
- `keeper.liquidations_submitted`
- `keeper.liquidations_failed`
- `oracle.updates_submitted`
- `read_index.refresh_success`
- `read_api.requests`
