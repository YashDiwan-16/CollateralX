import { StatCard } from "@/components/shared/stat-card"
import { BarChart } from "@/components/shared/bar-chart"
import { ConfigRow } from "@/components/shared/config-row"

const analyticsStats = [
  { label: "TVL (7d avg)", value: "$3.9M" },
  { label: "algoUSD supply", value: "$1.8M" },
  { label: "Liquidations (30d)", value: "42" },
  { label: "Avg. Coll. Ratio", value: "231%", valueClassName: "text-emerald-400" },
]

const tvlBars = [40, 50, 55, 48, 60, 65, 70, 62, 75, 80, 85, 78, 82, 88, 90, 95, 92, 98, 100, 94]
const supplyBars = [30, 38, 45, 52, 58, 65, 70, 72, 75, 80, 78, 82, 85, 87, 90, 92, 95, 97, 100, 98]
const liqBars = [10, 5, 20, 8, 15, 5, 30, 5, 45, 20, 10, 5, 5, 100, 30]

const collDist = [
  { label: "<150% (liq.)", count: 3, pct: 5, color: "bg-red-500" },
  { label: "150–180%", count: 11, pct: 18, color: "bg-amber-500" },
  { label: "180–250%", count: 174, pct: 55, color: "bg-emerald-500" },
  { label: ">250%", count: 130, pct: 42, color: "bg-blue-500" },
]

const healthSummary = [
  { label: "System solvency", value: "Solvent", sub: "Collateral exceeds all debt", cls: "text-emerald-400" },
  { label: "Oracle health", value: "Live", sub: "Last update 42s ago", cls: "text-emerald-400" },
  { label: "Debt ceiling utilization", value: "36%", sub: "1.8M / 5M algoUSD", cls: "" },
]

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-sm font-semibold">Protocol Analytics</h1>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2.5">
        {analyticsStats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">TVL trend — 30 days</div>
          <BarChart bars={tvlBars} height={120} />
          <p className="text-[10px] text-muted-foreground/50 italic mt-1.5">Y-axis: USD value. X-axis: daily snapshots.</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">algoUSD minted supply — 30 days</div>
          <BarChart bars={supplyBars} height={120} color="bg-blue-600/70 hover:bg-blue-500" />
          <p className="text-[10px] text-muted-foreground/50 italic mt-1.5">Cumulative algoUSD outstanding by day.</p>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Collateral distribution */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-1">Collateralization distribution</div>
          <p className="text-[11px] text-muted-foreground mb-3">Distribution of vault ratios across all active vaults</p>
          <div className="space-y-2">
            {collDist.map(({ label, count, pct, color }) => (
              <div key={label} className="flex items-center gap-2.5 text-xs">
                <span className="w-20 text-muted-foreground text-[10px]">{label}</span>
                <div className="flex-1 h-3 bg-muted/40 rounded-sm overflow-hidden">
                  <div className={`h-full rounded-sm ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-muted-foreground min-w-[20px] text-right">{count}</span>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground/50 italic mt-2">
            Color: red = liquidatable, amber = at-risk, green = healthy, blue = over-collateralized
          </p>
        </div>

        {/* Liquidation events + Oracle */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Liquidation events — 30 days</div>
          <BarChart bars={liqBars} height={80} color="bg-red-600/60 hover:bg-red-500" />
          <p className="text-[10px] text-muted-foreground/50 italic mt-1 mb-4">
            Spike = large price drop event. Peaks correlate with ALGO price drops.
          </p>
          <div className="text-xs font-medium text-muted-foreground mb-2">Oracle update frequency</div>
          <ConfigRow label="Avg. update interval" value="48s" />
          <ConfigRow label="Stale threshold" value=">5 minutes" />
          <ConfigRow label="Stale events (30d)" value="0" valueClassName="text-emerald-400" />
        </div>
      </div>

      {/* Health summary */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-medium text-muted-foreground mb-3">Protocol health summary</div>
        <div className="grid grid-cols-3 gap-3">
          {healthSummary.map(({ label, value, sub, cls }) => (
            <div key={label} className="bg-background rounded-md p-3">
              <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
              <div className={`text-sm font-semibold ${cls}`}>{value}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
