import Link from "next/link"
import { StatCard } from "@/components/shared/stat-card"
import { OracleStatus } from "@/components/shared/oracle-status"
import { EventLog, type EventItem } from "@/components/shared/event-log"
import { BarChart } from "@/components/shared/bar-chart"
import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const protoStats = [
  { label: "Total Value Locked", value: "$4.2M", sub: "↑ 3.1% 24h" },
  { label: "algoUSD Minted", value: "$1.8M", sub: "↑ 1.4% 24h" },
  { label: "Active Vaults", value: "318", sub: "12 new today" },
  { label: "System Collateral Ratio", value: "231%", sub: "Min required: 150%", valueClassName: "text-emerald-400" },
]

const priceBarData = [55, 60, 48, 65, 70, 62, 75, 80, 72, 68, 74, 78]

const liquidationEvents: EventItem[] = [
  { color: "red", time: "2m ago", text: "Vault #0041 liquidated — 4,200 ALGO" },
  { color: "red", time: "18m ago", text: "Vault #0039 liquidated — 1,100 ALGO" },
  { color: "amber", time: "1h ago", text: "Vault #0055 warning — ratio 156%" },
]

const recentEvents: EventItem[] = [
  { color: "green", time: "5m", text: "New vault #0318 created — 3,000 ALGO deposited" },
  { color: "green", time: "12m", text: "Vault #0212 minted 400 algoUSD" },
  { color: "amber", time: "22m", text: "Oracle price update: $0.3812" },
  { color: "green", time: "35m", text: "Vault #0180 repaid 200 algoUSD" },
  { color: "red", time: "41m", text: "Vault #0041 flagged for liquidation" },
]

const quickActions = [
  { label: "+ Create new vault", href: "/vaults/create", primary: true },
  { label: "Manage my vaults", href: "/vaults", primary: false },
  { label: "Browse liquidation opportunities", href: "/liquidate", primary: false },
  { label: "View protocol analytics", href: "/analytics", primary: false },
]

const positionRows = [
  ["Active vaults", "2", ""],
  ["Total collateral", "8,500 ALGO", ""],
  ["Total debt", "1,200 algoUSD", ""],
  ["Avg. ratio", "270%", "text-emerald-400"],
]

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Protocol Dashboard</h1>
        <OracleStatus label="Oracle live · last update 42s ago" />
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {protoStats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Price chart */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">ALGO / USD — Oracle Price</div>
          <div className="text-xl font-semibold mb-0.5">$0.3812</div>
          <div className="text-[10px] text-muted-foreground mb-3">
            Last update: block #42,881,204 · 42s ago
          </div>
          <BarChart bars={priceBarData} height={80} />
          <p className="text-[10px] text-muted-foreground/50 italic mt-1.5">24h price chart</p>
        </div>

        {/* Liquidation activity */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Liquidation Activity</div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-background rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">24h Liquidations</div>
              <div className="text-base font-semibold">7</div>
            </div>
            <div className="bg-background rounded-md p-2.5">
              <div className="text-[10px] text-muted-foreground mb-1">At-Risk Vaults</div>
              <div className="text-base font-semibold text-amber-400">14</div>
            </div>
          </div>
          <EventLog events={liquidationEvents} />
          <Link
            href="/liquidate"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-2 text-xs text-muted-foreground")}
          >
            View all liquidation opportunities →
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Recent events */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Recent Protocol Events</div>
          <EventLog events={recentEvents} />
        </div>

        {/* Quick actions + position */}
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
            {positionRows.map(([label, val, cls]) => (
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
