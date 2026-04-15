"use client"

import Link from "next/link"
import { StatCard } from "@/components/shared/stat-card"
import { OracleStatus } from "@/components/shared/oracle-status"
import { EventLog } from "@/components/shared/event-log"
import { BarChart } from "@/components/shared/bar-chart"
import { buttonVariants } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import {
  formatAlgo,
  formatBps,
  formatStable,
  formatUsd,
} from "@/lib/protocol/math"
import { cn } from "@/lib/utils"

const quickActions = [
  { label: "+ Create new vault", href: "/vaults/create", primary: true },
  { label: "Manage my vaults", href: "/vaults", primary: false },
  { label: "Browse liquidation opportunities", href: "/liquidate", primary: false },
  { label: "View protocol analytics", href: "/analytics", primary: false },
]

export default function DashboardPage() {
  const { snapshot, loading, error, refresh } = useProtocol()
  const oracleStatus = snapshot.oracle.isFresh ? "live" : "warn"
  const userCollateral = snapshot.userVaults.reduce((sum, vault) => sum + vault.collateralMicroAlgo, 0n)
  const userDebt = snapshot.userVaults.reduce((sum, vault) => sum + vault.debtMicroStable, 0n)
  const userRatio =
    userDebt === 0n
      ? null
      : (snapshot.userVaults.reduce((sum, vault) => sum + vault.collateralValueMicroStable, 0n) * 10_000n) / userDebt

  const protoStats = [
    { label: "Total Value Locked", value: formatUsd(snapshot.dashboard.tvlMicroUsd) },
    { label: "algoUSD Minted", value: formatStable(snapshot.dashboard.totalMintedMicroStable) },
    { label: "Active Vaults", value: snapshot.dashboard.vaultCount.toLocaleString("en-US") },
    {
      label: "System Collateral Ratio",
      value: formatBps(snapshot.dashboard.systemCollateralRatioBps),
      sub: `Min required: ${formatBps(snapshot.params.minCollateralRatioBps, "")}`,
      valueClassName:
        snapshot.dashboard.systemCollateralRatioBps === null ||
        snapshot.dashboard.systemCollateralRatioBps >= snapshot.params.minCollateralRatioBps + 3_000n
          ? "text-emerald-400"
          : "text-amber-400",
    },
  ]

  const liquidationEvents = snapshot.liquidationQueue.slice(0, 3).map((vault) => ({
    color: vault.isLiquidatable ? "red" as const : "amber" as const,
    time: "now",
    text: `Vault #${vault.displayId} ${vault.isLiquidatable ? "liquidatable" : "warning"} - ratio ${formatBps(vault.collateralRatioBps)}`,
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-sm font-semibold">Protocol Dashboard</h1>
          {loading && <p className="text-[11px] text-muted-foreground">Refreshing protocol state...</p>}
        </div>
        <div className="flex items-center gap-3">
          <OracleStatus
            status={oracleStatus}
            label={`Oracle ${snapshot.oracle.isFresh ? "live" : "stale"} · ${formatUsd(snapshot.oracle.pricePerAlgoMicroUsd, 4)}`}
          />
          <button onClick={refresh} className="text-[11px] text-muted-foreground hover:text-foreground">
            Refresh
          </button>
        </div>
      </div>

      {(error || snapshot.warnings.length > 0) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
          {error ?? snapshot.warnings[0]}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {protoStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">ALGO / USD - Oracle Price</div>
          <div className="text-xl font-semibold mb-0.5">{formatUsd(snapshot.oracle.pricePerAlgoMicroUsd, 4)}</div>
          <div className="text-[10px] text-muted-foreground mb-3">
            Last update: round #{snapshot.oracle.updatedRound.toLocaleString("en-US")} · freshness window{" "}
            {snapshot.oracle.maxAgeSeconds.toString()}s
          </div>
          <BarChart bars={snapshot.priceHistory} height={80} />
          <p className="text-[10px] text-muted-foreground/50 italic mt-1.5">Recent oracle samples</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Liquidation Queue Summary</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-background rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">Liquidatable Now</div>
              <div className="text-base font-semibold text-red-400">
                {snapshot.dashboard.liquidatableVaultCount.toString()}
              </div>
            </div>
            <div className="bg-background rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">At-Risk Vaults</div>
              <div className="text-base font-semibold text-amber-400">
                {snapshot.dashboard.atRiskVaultCount.toString()}
              </div>
            </div>
          </div>
          <EventLog events={liquidationEvents.length ? liquidationEvents : [{ color: "green", time: "now", text: "No vaults are currently near liquidation" }]} />
          <Link
            href="/liquidate"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-2 text-xs text-muted-foreground")}
          >
            View all liquidation opportunities
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Recent Protocol Events</div>
          <EventLog events={snapshot.events} />
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Quick Actions</div>
          <div className="flex flex-col gap-2 mb-4">
            {quickActions.map(({ label, href, primary }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  buttonVariants({ variant: primary ? "secondary" : "ghost", size: "sm" }),
                  "justify-start"
                )}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="pt-3 border-t border-border">
            <div className="text-xs font-medium text-muted-foreground mb-2">My position summary</div>
            {[
              ["Active vaults", snapshot.userVaults.length.toString(), ""],
              ["Total collateral", formatAlgo(userCollateral), ""],
              ["Total debt", formatStable(userDebt), ""],
              ["Avg. ratio", formatBps(userRatio), userRatio === null || userRatio >= 18_000n ? "text-emerald-400" : "text-amber-400"],
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between py-1.5 border-b border-border last:border-0 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className={cn("font-medium", cls)}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
