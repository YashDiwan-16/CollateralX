import Link from "next/link"
import { RiskMeter } from "@/components/shared/risk-meter"
import { ConfigRow } from "@/components/shared/config-row"
import { StatusBadge } from "@/components/shared/status-badge"
import { ActionTabs } from "@/components/pages/vault-detail/action-tabs"
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

const txHistory = [
  { time: "Today 14:32", action: "Mint", amount: "+400 algoUSD", ratioAfter: "238%", hash: "0xab3f…1e22" },
  { time: "Today 09:11", action: "Deposit", amount: "+2,000 ALGO", ratioAfter: "310%", hash: "0x9c21…4d01" },
  { time: "Yesterday", action: "Repay", amount: "−200 algoUSD", ratioAfter: "271%", hash: "0x12ef…88bb" },
]

export default async function VaultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/vaults" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 text-xs px-2 text-muted-foreground")}>
          ← My Vaults
        </Link>
        <span className="text-sm font-semibold">Vault #{id}</span>
        <StatusBadge status="safe" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Vault Summary</div>
          <div className="flex gap-0 mb-4">
            <div className="pr-4 mr-4 border-r border-border">
              <div className="text-[10px] text-muted-foreground mb-0.5">Collateral</div>
              <div className="text-lg font-semibold">5,000 ALGO</div>
              <div className="text-[10px] text-muted-foreground">≈ $1,906</div>
            </div>
            <div className="pr-4 mr-4 border-r border-border">
              <div className="text-[10px] text-muted-foreground mb-0.5">Debt</div>
              <div className="text-lg font-semibold">800 algoUSD</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">ALGO Price</div>
              <div className="text-lg font-semibold">$0.3812</div>
            </div>
          </div>
          <div className="pt-3 border-t border-border">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Collateral Ratio</span>
              <span className="font-semibold text-emerald-400">238%</span>
            </div>
            <RiskMeter ratio={238} className="mb-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Liq. threshold 150%</span>
              <span>Current 238%</span>
              <span>Max ~666%</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Risk Indicators</div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-background rounded-md p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Health Factor</div>
              <div className="text-2xl font-semibold text-emerald-400">1.59</div>
              <div className="text-[10px] text-muted-foreground">Safe above 1.0</div>
            </div>
            <div className="bg-background rounded-md p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Liquidation Price</div>
              <div className="text-lg font-semibold">$0.240</div>
              <div className="text-[10px] text-muted-foreground">ALGO must stay above</div>
            </div>
          </div>
          <ConfigRow label="Max mintable" value="870 algoUSD" />
          <ConfigRow label="Available to withdraw" value="2,802 ALGO" />
          <ConfigRow label="Stability fee" value="2.5% / yr" />
        </div>
      </div>

      <ActionTabs />

      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 pt-4 pb-2 text-xs font-medium text-muted-foreground">Transaction History</div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {["Time", "Action", "Amount", "Ratio After", "Tx Hash"].map((h) => (
                <TableHead key={h} className="text-[11px] font-medium text-muted-foreground">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {txHistory.map((tx, i) => (
              <TableRow key={i} className="border-border text-xs">
                <TableCell>{tx.time}</TableCell>
                <TableCell>{tx.action}</TableCell>
                <TableCell>{tx.amount}</TableCell>
                <TableCell>{tx.ratioAfter}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-[10px]">{tx.hash}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
