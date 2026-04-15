import { StatCard } from "@/components/shared/stat-card"
import { OracleStatus } from "@/components/shared/oracle-status"
import { ConfigRow } from "@/components/shared/config-row"
import { EventLog, type EventItem } from "@/components/shared/event-log"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"

const adminStats = [
  { label: "System collateral ratio", value: "231%", valueClassName: "text-emerald-400" },
  { label: "Under-collateralized vaults", value: "3", valueClassName: "text-red-400" },
  { label: "Debt ceiling remaining", value: "3.2M algoUSD" },
  { label: "Oracle staleness", value: "0 events", valueClassName: "text-emerald-400" },
]

const adminEvents: EventItem[] = [
  { color: "amber", time: "2d ago", text: "Stability fee updated: 2.0% → 2.5%" },
  { color: "green", time: "5d ago", text: "Oracle address rotated" },
  { color: "amber", time: "8d ago", text: "Debt ceiling raised: 3M → 5M algoUSD" },
  { color: "red", time: "14d ago", text: "Emergency pause triggered (resolved)" },
  { color: "green", time: "14d ago", text: "Protocol resumed after oracle fix" },
]

export default function AdminPage() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Admin / Operator Panel</h1>
        <StatusBadge status="safe" />
      </div>

      {/* Oracle + Keeper */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Oracle Feed Status</div>
          <OracleStatus label="ALGO/USD oracle — live and updating" />
          <div className="mt-3 space-y-0">
            <ConfigRow label="Current price" value="$0.3812" />
            <ConfigRow label="Last block update" value="#42,881,204" />
            <ConfigRow label="Last timestamp" value="42s ago" />
            <ConfigRow label="Stale threshold" value="300s" />
            <div className="flex justify-between items-center py-2 border-b border-border text-xs">
              <span className="text-muted-foreground">Oracle address</span>
              <span className="font-mono text-[10px]">ALGO…orc3</span>
            </div>
            <ConfigRow label="Status" value="Healthy" valueClassName="text-emerald-400" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Keeper / Liquidator Bot Status</div>
          <OracleStatus label="Keeper bot active" />
          <div className="mt-3 space-y-0">
            <div className="flex justify-between items-center py-2 border-b border-border text-xs">
              <span className="text-muted-foreground">Bot wallet</span>
              <span className="font-mono text-[10px]">ALGO…k33p</span>
            </div>
            <ConfigRow label="Last run" value="38s ago" />
            <ConfigRow label="Liquidations today" value="7" />
            <ConfigRow label="Vaults scanned / hr" value="318" />
            <ConfigRow label="Bot ALGO balance" value="12,400 ALGO" />
          </div>
        </div>
      </div>

      {/* Config + Events */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Protocol Configuration</div>
          <ConfigRow label="Min. collateral ratio" value="150%" />
          <ConfigRow label="Liquidation threshold" value="150%" />
          <ConfigRow label="Liquidation penalty" value="13%" valueClassName="text-amber-400" />
          <ConfigRow label="Stability fee" value="2.5% / yr" />
          <ConfigRow label="Global debt ceiling" value="5,000,000 algoUSD" />
          <ConfigRow label="Per-vault debt ceiling" value="50,000 algoUSD" />
          <ConfigRow label="Protocol paused" value="No" valueClassName="text-emerald-400" />
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" className="h-7 text-xs">
              Propose config change
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
            >
              Emergency pause
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Recent Admin Events</div>
          <EventLog events={adminEvents} />
        </div>
      </div>

      {/* Risk summary */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-medium text-muted-foreground mb-3">Protocol-level risk summary</div>
        <div className="grid grid-cols-4 gap-2.5">
          {adminStats.map((s) => <StatCard key={s.label} {...s} />)}
        </div>
      </div>
    </div>
  )
}
