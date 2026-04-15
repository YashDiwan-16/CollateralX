# CollateralX Frontend Runbook

## Overview

The frontend is a Next.js TypeScript app built around an AlgoKit-compatible signer handoff:

`use-wallet-react -> AlgorandClient.setSigner() -> generated typed app clients -> contract method calls`

The app supports two data modes:

`mock` is the default. It gives deterministic protocol data and mutates local UI state, which keeps component and e2e tests fast.

`chain` reads and submits against deployed LocalNet/TestNet/MainNet app ids using generated clients copied from the contract artifacts.

## Setup

```bash
cd frontend
pnpm install
cp .env.example .env.local
pnpm dev
```

To sync generated clients after rebuilding contracts:

```bash
cd frontend
pnpm sync:clients
```

## LocalNet Configuration

Start LocalNet and deploy contracts from the repository root:

```bash
algokit localnet start
algokit project run build
algokit project deploy localnet
```

Then set these values in `frontend/.env.local`:

```bash
NEXT_PUBLIC_COLLATERALX_DATA_MODE=chain
NEXT_PUBLIC_ALGORAND_NETWORK=localnet
NEXT_PUBLIC_PROTOCOL_APP_ID=<protocol-manager-app-id>
NEXT_PUBLIC_ORACLE_APP_ID=<oracle-adapter-app-id>
NEXT_PUBLIC_STABLECOIN_APP_ID=<stablecoin-controller-app-id>
NEXT_PUBLIC_LIQUIDATION_APP_ID=<liquidation-executor-app-id>
```

The default `.env.example` Algod and Indexer endpoints match AlgoKit LocalNet defaults.

## Transaction Model

Create vault uses `CollateralXProtocolManager.createVault` with deterministic box references for the next vault id.

Deposit uses a grouped payment transaction argument: ALGO payment from the vault owner to the protocol app, then `depositCollateral`.

Mint uses `mintStablecoin` with oracle app, stablecoin controller app, stable ASA, owner account, stablecoin app account, and the vault box reference. The frontend simulates before submit.

Repay uses a grouped ASA transfer from the vault owner to the stablecoin controller app, then `repay`.

Withdraw uses `withdrawCollateral` with oracle app and vault lifecycle boxes. The contract checks post-withdrawal health against the current oracle price.

Liquidation uses a grouped stablecoin repayment transfer and `liquidate`, with oracle/stablecoin app references, stable ASA, liquidator/owner accounts, and vault lifecycle boxes.

## Discovery

The chain repository reads `readProtocolStatus`, `readProtocolParams`, `readOraclePrice`, and `readStablecoinControlState`.

Vaults are discovered by deterministic ids from `1..nextVaultId-1` and read with vault box references. Closed vaults are expected to fail reads because their boxes are explicitly deleted.

Keepers and indexers can derive the liquidation queue by reading vault records, applying the shared collateral-ratio math, and filtering by `liquidationRatioBps`.

## Testing

```bash
cd frontend
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Playwright starts the app in `mock` mode so create/deposit/mint/repay/withdraw workflows are deterministic. LocalNet-backed manual testing is practical by switching `.env.local` to `chain` mode and using deployed app ids.
