import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const liquidateStats = [
  { label: "Liquidatable now", value: "3", valueClassName: "text-red-400" },
  { label: "At-risk (ratio <180%)", value: "11", valueClassName: "text-amber-400" },
  { label: "Total liquidatable debt", value: "$8,200" },
  { label: "Est. liquidator reward", value: "$1,066", valueClassName: "text-emerald-400" },
]

const vaults = [
  { id: "0041", collateral: "3,100 ALGO", debt: "850 algoUSD", ratio: 139, status: "liquidatable" as const, reward: "~110 algoUSD", canLiquidate: true },
  { id: "0055", collateral: "2,800 ALGO", debt: "700 algoUSD", ratio: 144, status: "liquidatable" as const, reward: "~91 algoUSD", canLiquidate: true },
  { id: "0099", collateral: "5,500 ALGO", debt: "1,400 algoUSD", ratio: 148, status: "liquidatable" as const, reward: "~182 algoUSD", canLiquidate: true },
  { id: "0112", collateral: "4,200 ALGO", debt: "900 algoUSD", ratio: 156, status: "at-risk" as const, reward: "—", canLiquidate: false },
  { id: "0157", collateral: "6,100 ALGO", debt: "1,200 algoUSD", ratio: 162, status: "at-risk" as const, reward: "—", canLiquidate: false },
]

function ratioColor(ratio: number) {
  if (ratio < 150) return "text-red-400"
  if (ratio < 180) return "text-amber-400"
  return "text-emerald-400"
}

export default function LiquidatePage() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Liquidation Opportunities</h1>
        <div className="flex gap-2">
          <Select defaultValue="lowest-ratio">
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lowest-ratio" className="text-xs">Sort: Lowest ratio</SelectItem>
              <SelectItem value="highest-reward" className="text-xs">Sort: Highest reward</SelectItem>
              <SelectItem value="largest-debt" className="text-xs">Sort: Largest debt</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="all">
            <SelectTrigger className="h-7 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All vaults</SelectItem>
              <SelectItem value="160" className="text-xs">Ratio &lt;160%</SelectItem>
              <SelectItem value="170" className="text-xs">Ratio &lt;170%</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-2.5">
        {liquidateStats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* Alert */}
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
        <span className="font-medium">3 vaults</span> are currently below the 150% collateral threshold and can be liquidated. You earn 13% of collateral as reward.
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {["Vault ID", "Collateral", "Debt", "Coll. Ratio", "Health", "Liq. Reward (~13%)", "Action"].map((h) => (
                <TableHead key={h} className="text-[11px] font-medium text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vaults.map((v) => (
              <TableRow key={v.id} className="border-border text-xs">
                <TableCell className="font-semibold">#{v.id}</TableCell>
                <TableCell>{v.collateral}</TableCell>
                <TableCell>{v.debt}</TableCell>
                <TableCell className={`font-semibold ${ratioColor(v.ratio)}`}>{v.ratio}%</TableCell>
                <TableCell><StatusBadge status={v.status} /></TableCell>
                <TableCell className={v.canLiquidate ? "font-semibold" : "text-muted-foreground"}>
                  {v.reward}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant={v.canLiquidate ? "default" : "outline"}
                    disabled={!v.canLiquidate}
                    className="h-6 text-[11px] px-2.5"
                  >
                    Liquidate
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground/50 italic">
            Liquidation executes on-chain. You repay vault debt in algoUSD and receive ALGO collateral at a 13% discount. You must hold sufficient algoUSD in wallet.
          </p>
        </div>
      </div>
    </div>
  )
}
