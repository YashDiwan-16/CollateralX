# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Layout

```
CollateralX/
├── algo_stablecoin_protocol_wireframe.html   # Single-file UI wireframe (reference design, 8 screens)
├── contracts/                                 # AlgoKit workspace (Algorand smart contracts)
│   └── projects/                             # Smart contract sub-projects (currently empty)
└── frontend/                                 # Next.js 16 web app
```

`contracts/` and `frontend/` are independent sub-projects with their own toolchains. There is no top-level package.json.

---

## Frontend (`frontend/`)

### Stack
- **Next.js 16** (App Router) · **React 19** · **TypeScript 5** · **Tailwind CSS v4**
- Package manager: `pnpm` (workspace declared via `pnpm-workspace.yaml`)
- ESLint 9 flat config (`eslint.config.mjs`) — uses `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`

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
- All routes live under `frontend/app/`. Root layout (`app/layout.tsx`) loads Geist fonts (via `next/font/google`) and wraps everything in `<body className="min-h-full flex flex-col">`.
- Theme tokens (`--background`, `--foreground`, `--font-sans`, `--font-mono`) are defined in `app/globals.css` via `@theme inline`. Dark mode is handled with a `@media (prefers-color-scheme: dark)` block on `:root` CSS vars.
- TypeScript path alias: `@/*` → `./` (frontend root), configured in `tsconfig.json`.
- `app/page.tsx` is the current placeholder home page — this is where the CollateralX UI should be built.

---

## Contracts (`contracts/`)

### Stack
- **AlgoKit** workspace (min version `v1.12.1`)
- Smart contract language: **Algorand TypeScript (PuyaTs)** by default; Algorand Python (PuyaPy) only if explicitly requested
- Compiled to TEAL bytecode by the Puya compiler — these are AVM-constrained language subsets, NOT full TypeScript/Python
- Smart contract sub-projects are created with `algokit init` inside `contracts/` and land in `contracts/projects/`

### Commands
```bash
cd contracts
algokit init          # scaffold a new smart contract project
algokit generate devcontainer   # generate devcontainer config for Codespaces
```

Individual smart contract projects will have their own `README.md` inside `contracts/projects/<project-name>/` with build/test/deploy commands.

### Mandatory contract development rules
- **Never** use PyTEAL, Beaker (both legacy/superseded), or raw TEAL
- **Never** import external/third-party libraries into contract code
- Before writing any contract code, follow the workflow in `AGENTS.md`: search docs via the `kappa` MCP → retrieve canonical examples via `vibekit-mcp` GitHub tools → load the relevant skill from `.claude/skills/`

### MCP servers (configured in `.mcp.json`)
| Server | Tool prefix | Purpose |
|--------|-------------|---------|
| `kappa` | `kappa_search_algorand_knowledge_sources` | Official Algorand docs search |
| `vibekit-mcp` | `github_search_code`, `github_get_file_contents` | Canonical examples from `algorandfoundation/*` repos |

### Canonical example repos (via vibekit-mcp)
1. `algorandfoundation/devportal-code-examples` — beginner patterns (`projects/typescript-examples/contracts/`)
2. `algorandfoundation/puya-ts` — advanced TypeScript (`examples/hello-world/`, `examples/auction/`, `examples/voting/`)
3. `algorandfoundation/puya` — advanced Python examples

---

## Wireframe (`algo_stablecoin_protocol_wireframe.html`)

Single-file HTML reference design — no build step, open directly in a browser. Covers 8 screens navigated via `switchPage(id)`:

| Screen ID      | Purpose                                      |
|----------------|----------------------------------------------|
| `landing`      | Protocol overview + connect wallet CTA        |
| `dashboard`    | Protocol stats, active vaults summary         |
| `vaults`       | User's vault list                             |
| `vault-detail` | Per-vault manage UI (deposit/mint/repay/withdraw tabs, live ratio preview) |
| `create`       | Create new vault flow                         |
| `liquidate`    | Browse and trigger liquidation opportunities  |
| `analytics`    | Protocol-wide analytics                       |
| `admin`        | Admin / ops panel                             |

The wireframe uses a CSS-variable design system (`--color-text-*`, `--color-background-*`, `--color-border-*`, `--border-radius-*`). Inline comments contain domain logic details. Use this file as the authoritative UX spec when building the frontend.

---

## Domain Concepts

- **Vault**: Per-user smart contract holding ALGO collateral; tracks algoUSD debt.
- **Collateral Ratio**: `(collateral_value_USD / debt_algoUSD) × 100`. Minimum enforced: 150%.
- **Liquidation Price**: ALGO price at which ratio hits exactly 150%.
- **algoUSD**: Minted stablecoin; max mintable = `collateral_value / 1.5`.
- Status bands: Safe > 180% · Warn 150–180% · Danger < 155% (liquidatable).
