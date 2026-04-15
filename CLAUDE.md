# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
CollateralX/
├── docs/
│   └── algo_stablecoin_protocol_wireframe.html   # Reference UI wireframe (8 screens)
├── algorand/                                      # AlgoKit workspace (Algorand smart contracts)
│   └── contracts/projects/contracts/             # Active smart contract project
│       └── smart_contracts/
│           ├── hello_world/                       # Starter contract (replace with protocol contracts)
│           │   ├── contract.algo.ts               # Contract source
│           │   └── deploy-config.ts               # Deployment logic
│           └── index.ts                           # Auto-discovers & runs all deploy-config.ts files
└── frontend/                                      # Next.js 16 web app
```

`algorand/` and `frontend/` are independent sub-projects with their own toolchains. No top-level `package.json`.

---

## Frontend (`frontend/`)

### Stack
- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** · **Tailwind CSS v4**
- Package manager: `pnpm` (workspace declared via `pnpm-workspace.yaml`)
- ESLint 9 flat config (`eslint.config.mjs`) — `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`

### Commands
```bash
cd frontend
pnpm dev        # dev server at localhost:3000
pnpm build      # production build
pnpm start      # serve production build
pnpm lint       # ESLint
```

No test runner is configured yet.

### Critical: Breaking-change versions

**Next.js 16 and Tailwind CSS v4 both have breaking changes** from prior major versions. Before writing or modifying any frontend code, read the bundled docs:

- Next.js API reference: `node_modules/next/dist/docs/` (index at `index.md`, App Router under `01-app/`)
- Tailwind CSS v4 no longer uses `tailwind.config.js`; all theme customization goes inside `@theme` blocks in CSS (see `app/globals.css`)

### App Router & conventions
- All routes live under `frontend/app/`. Root layout (`app/layout.tsx`) loads Geist fonts via `next/font/google` and wraps everything in `<body className="min-h-full flex flex-col">`.
- Theme tokens (`--background`, `--foreground`, `--font-sans`, `--font-mono`) are in `app/globals.css` via `@theme inline`. Dark mode uses `@media (prefers-color-scheme: dark)` on `:root` CSS vars.
- TypeScript path alias: `@/*` → `./` (frontend root), configured in `tsconfig.json`.
- `app/page.tsx` is the placeholder home page — the CollateralX UI is built here.

---

## Algorand Contracts (`algorand/`)

### Stack & pre-requisites
- **AlgoKit CLI** ≥ 2.5 · **Node.js** ≥ 22 · **Docker** (for LocalNet) · **Puya compiler** ≥ 4.4.4
- Contract language: **Algorand TypeScript (PuyaTs)** — default; Python (PuyaPy) only if explicitly requested
- PuyaTs is an AVM-constrained TypeScript subset compiled to TEAL. It is **not** full TypeScript — no external library imports in contract code
- Key packages: `@algorandfoundation/algorand-typescript`, `@algorandfoundation/algokit-utils`, `puya-ts`

### Commands
```bash
# Run from: algorand/contracts/projects/contracts/
npm run check-types                        # TypeScript type check (no emit)

# Run from: algorand/  (workspace root)
algokit project bootstrap all             # Install npm deps for all sub-projects
algokit localnet start                    # Start local Algorand network (requires Docker)
algokit project run build                 # Compile all contracts → artifacts/
algokit project run build -- hello_world  # Compile a single contract
algokit project deploy localnet           # Deploy to LocalNet
algokit project deploy localnet -- hello_world  # Deploy a single contract
algokit generate env-file -a target_network localnet  # Create .env.localnet
algokit generate smart-contract           # Scaffold a new contract
```

### Contract structure
- Each contract lives in its own subfolder: `smart_contracts/{contract_name}/contract.algo.ts`
- Deployment logic lives in `smart_contracts/{contract_name}/deploy-config.ts`
- `index.ts` auto-imports all `deploy-config.ts` files — no manual wiring needed unless you want selective deploys
- Build output: `smart_contracts/artifacts/` — compiled TEAL + ABI specs
- Generated TypeScript client: `smart_contracts/artifacts/{contract_name}/{ContractName}Client.ts`
- Deployment uses `AlgorandClient.fromEnvironment()` + typed factory pattern from the generated client

### Mandatory contract development rules
- **Never** use PyTEAL, Beaker (legacy/superseded), or raw TEAL
- **Never** import external/third-party libraries inside contract source files
- Before writing contract code, follow the workflow in `AGENTS.md`: search docs via `kappa` MCP → get canonical examples via `vibekit-mcp` GitHub tools → load the relevant skill from `.claude/skills/`

### MCP servers (configured in `.mcp.json`)
| Server | Key tools | Purpose |
|--------|-----------|---------|
| `kappa` | `kappa_search_algorand_knowledge_sources` | Official Algorand docs |
| `vibekit-mcp` | `github_search_code`, `github_get_file_contents` | Canonical examples from `algorandfoundation/*` repos |

**Priority example repos** (search via `vibekit-mcp`):
1. `algorandfoundation/devportal-code-examples` — beginner patterns (`projects/typescript-examples/contracts/`)
2. `algorandfoundation/puya-ts` — advanced TS (`examples/hello-world/`, `examples/auction/`, `examples/voting/`)
3. `algorandfoundation/puya` — advanced Python examples

---

## Wireframe (`docs/algo_stablecoin_protocol_wireframe.html`)

Single-file HTML reference design — open directly in browser, no build step. Authoritative UX spec for the frontend. 8 screens navigated via `switchPage(id)`:

| Screen ID      | Purpose |
|----------------|---------|
| `landing`      | Protocol overview + connect wallet CTA |
| `dashboard`    | Protocol stats, active vaults summary |
| `vaults`       | User's vault list |
| `vault-detail` | Per-vault manage UI (deposit / mint / repay / withdraw tabs, live ratio preview) |
| `create`       | Create new vault flow |
| `liquidate`    | Browse and trigger liquidation opportunities |
| `analytics`    | Protocol-wide analytics |
| `admin`        | Admin / ops panel |

Uses a CSS-variable design system (`--color-text-*`, `--color-background-*`, `--color-border-*`, `--border-radius-*`). Inline comments contain domain logic details.

---

## Domain Concepts

- **Vault**: Per-user smart contract holding ALGO collateral; tracks algoUSD debt.
- **Collateral Ratio**: `(collateral_value_USD / debt_algoUSD) × 100`. Minimum enforced: 150%.
- **Liquidation Price**: ALGO price at which ratio hits exactly 150%.
- **algoUSD**: Minted stablecoin; max mintable = `collateral_value / 1.5`.
- Status bands: Safe > 180% · Warn 150–180% · Danger < 155% (liquidatable).
