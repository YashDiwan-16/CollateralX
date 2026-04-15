# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
CollateralX/
├── algo_stablecoin_protocol_wireframe.html   # Single-file UI wireframe (reference design)
├── contracts/                                 # AlgoKit workspace (Algorand smart contracts)
│   └── projects/                             # Smart contract sub-projects go here (currently empty)
└── frontend/                                 # Next.js 16 web app
```

The `contracts/` and `frontend/` directories are independent sub-projects with their own toolchains.

---

## Frontend (`frontend/`)

### Stack
- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** · **Tailwind CSS v4**
- Package manager: `pnpm` (workspace declared via `pnpm-workspace.yaml`)

### Commands
```bash
cd frontend
pnpm dev        # start dev server at localhost:3000
pnpm build      # production build
pnpm start      # serve production build
pnpm lint       # ESLint (eslint-config-next core-web-vitals + typescript)
```

### Critical: Breaking-change versions

**Next.js 16 and Tailwind CSS v4 both have breaking changes** from prior major versions. Before writing or modifying any frontend code, read the bundled docs:

- Next.js API reference: `node_modules/next/dist/docs/` (index at `index.md`, App Router under `01-app/`)
- Tailwind CSS v4 no longer uses `tailwind.config.js`; theme customization is done inside CSS via `@theme` blocks (see `app/globals.css`)

The `frontend/AGENTS.md` (auto-included via `frontend/CLAUDE.md`) repeats this warning — heed it.

### App Router structure
All routes live under `frontend/app/`. The root layout (`app/layout.tsx`) loads Geist fonts and sets up `<html>`/`<body>` with `min-h-full flex flex-col`. Theme tokens (`--background`, `--foreground`, `--font-sans`, `--font-mono`) are defined in `app/globals.css` using Tailwind v4's `@theme inline` block.

---

## Contracts (`contracts/`)

### Stack
- **AlgoKit** workspace (min version `v1.12.1`)
- Smart contract sub-projects are created with `algokit init` inside `contracts/` and land in `contracts/projects/`

### Commands
```bash
cd contracts
algokit init          # scaffold a new smart contract project
algokit generate devcontainer   # generate devcontainer config for Codespaces
```

Individual smart contract projects (once created) will have their own `README.md` with build/test/deploy commands inside `contracts/projects/<project-name>/`.

---

## Wireframe (`algo_stablecoin_protocol_wireframe.html`)

A standalone single-file HTML reference wireframe covering 8 screens of the protocol UI. No build step — open directly in a browser. Uses a CSS-variable design system (`--color-text-*`, `--color-background-*`, `--color-border-*`, `--border-radius-*`) and vanilla JS `switchPage()` routing. See inline comments for domain details (vault mechanics, collateral ratio thresholds, oracle status, algoUSD minting).

---

## Domain Concepts

- **Vault**: Per-user smart contract holding ALGO collateral; tracks algoUSD debt.
- **Collateral Ratio**: `(collateral_value_USD / debt_algoUSD) × 100`. Minimum: 150%.
- **Liquidation Price**: ALGO price at which ratio hits exactly 150%.
- **algoUSD**: Minted stablecoin; max mintable = `collateral_value / 1.5`.
- Status bands: Safe > 180%, Warn 150–180%, Danger < 155% (liquidatable).
