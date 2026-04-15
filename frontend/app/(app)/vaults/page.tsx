import Link from "next/link"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const vaultStats = [
  { label: "Total Collateral", value: "8,500 ALGO" },
  { label: "Total Debt", value: "1,200 algoUSD" },
  { label: "Avg. Collateral Ratio", value: "270%", valueClassName: "text-emerald-400" },
  { label: "Vault Count", value: "2" },
]

const vaults = [
  { id: "0211", collateral: "5,000 ALGO", collateralUsd: "$1,906", debt: "800 algoUSD", algoPrice: "$0.3812", ratio: 238, liqPrice: "$0.240", status: "safe" as const },
  { id: "0212", collateral: "3,500 ALGO", collateralUsd: "$1,334", debt: "400 algoUSD", algoPrice: "$0.3812", ratio: 333, liqPrice: "$0.171", status: "safe" as const },
]

function ratioColor(ratio: number) {
  if (ratio >= 180) return "text-emerald-400"
  if (ratio >= 150) return "text-amber-400"
  return "text-red-400"
}

export default function VaultsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">My Vaults</h1>
        <Link href="/vaults/create" className={cn(buttonVariants({ size: "sm" }))}>
          + Create Vault
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {vaultStats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="bg-card border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {["Vault", "Collateral", "Debt", "ALGO Price", "Coll. Ratio", "Liq. Price", "Status", "Actions"].map((h) => (
                <TableHead key={h} className="text-xs font-medium text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vaults.map((v) => (
              <TableRow key={v.id} className="border-border text-xs">
                <TableCell className="font-semibold">#{v.id}</TableCell>
                <TableCell>
                  <div>{v.collateral}</div>
                  <div className="text-[10px] text-muted-foreground">{v.collateralUsd}</div>
                </TableCell>
                <TableCell>{v.debt}</TableCell>
                <TableCell>{v.algoPrice}</TableCell>
                <TableCell className={cn("font-semibold", ratioColor(v.ratio))}>{v.ratio}%</TableCell>
                <TableCell>{v.liqPrice}</TableCell>
                <TableCell><StatusBadge status={v.status} /></TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    <Link href={`/vaults/${v.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 text-[11px] px-2")}>View</Link>
                    <Link href={`/vaults/${v.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-6 text-[11px] px-2")}>Deposit</Link>
                    <Link href={`/vaults/${v.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-6 text-[11px] px-2")}>Mint</Link>
                    <Link href={`/vaults/${v.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-6 text-[11px] px-2")}>Repay</Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground/50 italic">
            Color coding: Safe = green ratio, Warn = amber (ratio 150–180%), Danger = red (ratio below 155%)
          </p>
        </div>
      </div>

      <div className="bg-card border border-dashed border-border rounded-lg p-8 text-center">
        <p className="text-xs text-muted-foreground mb-3">No more vaults. Create another to diversify collateral positions.</p>
        <Link href="/vaults/create" className={cn(buttonVariants({ size: "sm" }))}>
          + Create new vault
        </Link>
      </div>
    </div>
  )
}
