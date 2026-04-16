"use client"

import Link from "next/link"
import { Navbar } from "@/components/layout/navbar"
import { Sidebar } from "@/components/layout/sidebar"
import { buttonVariants } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import { formatBps, formatStable, formatUsd } from "@/lib/protocol/math"
import { cn } from "@/lib/utils"

const features = [
  { icon: "◈", title: "Mint algoUSD", desc: "Borrow against ALGO at 150%+ collateral ratio" },
  { icon: "⬡", title: "Manage vaults", desc: "Deposit, withdraw, repay anytime from your dashboard" },
  { icon: "⊙", title: "Oracle-backed pricing", desc: "ALGO price fed on-chain, auditable by anyone" },
  { icon: "⊘", title: "Transparent liquidations", desc: "Anyone can liquidate undercollateralized vaults" },
]

const howItWorks = [
  { step: "1", title: "Deposit ALGO", desc: "Lock ALGO collateral in your vault smart contract" },
  { step: "2", title: "Mint algoUSD", desc: "Borrow up to 66% of collateral value (150% min ratio)" },
  { step: "3", title: "Stay safe", desc: "Monitor your ratio. Repay or add collateral to avoid liquidation" },
]

export default function LandingPage() {
  const { snapshot, loading, error } = useProtocol()
  const hasLiveOverviewData = snapshot.mode === "chain"
  const protocolStats = hasLiveOverviewData
    ? [
        { label: "Total Value Locked", value: formatUsd(snapshot.dashboard.tvlMicroUsd) },
        { label: "algoUSD Minted", value: formatStable(snapshot.dashboard.totalMintedMicroStable) },
        { label: "Active Vaults", value: snapshot.dashboard.vaultCount.toLocaleString("en-US") },
        { label: "System Collateral Ratio", value: formatBps(snapshot.dashboard.systemCollateralRatioBps) },
      ]
    : [
        { label: "Total Value Locked", value: "Unavailable" },
        { label: "algoUSD Minted", value: "Unavailable" },
        { label: "Active Vaults", value: "Unavailable" },
        { label: "System Collateral Ratio", value: "Unavailable" },
      ]

  const statusLabel = hasLiveOverviewData
    ? `${snapshot.network.toUpperCase()} live · Oracle ${snapshot.oracle.isFresh ? "active" : "stale"}`
    : loading
      ? "Loading live protocol data"
      : "Live protocol data unavailable"

  return (
    <div className="flex flex-col h-full">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="max-w-2xl mx-auto px-6 py-12 text-center">
            {/* Hero */}
            <div className="mb-10">
              <div
                className={cn(
                  "inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs mb-5",
                  hasLiveOverviewData
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/10 border border-amber-500/20 text-amber-300"
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full",
                    hasLiveOverviewData ? "bg-emerald-400 animate-pulse" : "bg-amber-300"
                  )}
                />
                {statusLabel}
              </div>
              <h1 className="text-3xl font-semibold tracking-tight mb-3">
                Mint stablecoins against<br />ALGO collateral
              </h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto mb-7">
                Deposit ALGO, mint algoUSD. A transparent, overcollateralized stablecoin protocol on
                Algorand — with real-time oracle pricing, on-chain liquidations, and vault-level risk monitoring.
              </p>
              <div className="flex items-center justify-center gap-3 mb-8">
                <Link href="/vaults/create" className={buttonVariants()}>
                  Connect Wallet &amp; Create Vault
                </Link>
                <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
                  View Protocol Stats
                </Link>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-4 gap-3 mb-10">
              {protocolStats.map(({ label, value }) => (
                <div key={label} className="bg-card border border-border rounded-lg p-3 text-left">
                  <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
                  <div className="text-base font-semibold">{value}</div>
                </div>
              ))}
            </div>

            {!hasLiveOverviewData && (
              <div className="mb-10 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-left text-xs text-amber-300">
                {error
                  ? `Overview data is unavailable right now: ${error}`
                  : "This overview page only shows live protocol data. Configure chain access or wait for the latest chain snapshot to load."}
              </div>
            )}

            {/* Features */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {features.map(({ icon, title, desc }) => (
                <div key={title} className="bg-card border border-border rounded-lg p-3.5 text-left">
                  <div className="text-xl mb-2 opacity-70">{icon}</div>
                  <div className="text-xs font-medium mb-1">{title}</div>
                  <div className="text-[11px] text-muted-foreground leading-relaxed">{desc}</div>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="bg-card border border-border rounded-lg p-5 text-left mb-5">
              <div className="text-xs font-medium text-muted-foreground mb-4">How it works</div>
              <div className="grid grid-cols-3 gap-5">
                {howItWorks.map(({ step, title, desc }) => (
                  <div key={step}>
                    <div className="w-6 h-6 rounded-full bg-secondary border border-border flex items-center justify-center text-xs font-semibold mb-2">
                      {step}
                    </div>
                    <div className="text-xs font-medium mb-1">{title}</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk banner */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-xs text-amber-400 text-left">
              <span className="font-medium">Risk disclosure:</span> DeFi involves smart contract risk,
              oracle risk, and market volatility. Collateral may be liquidated if ratio falls below threshold.
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
