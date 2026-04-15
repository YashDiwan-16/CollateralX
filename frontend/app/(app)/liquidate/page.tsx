"use client"

import Link from "next/link"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import {
  formatAlgo,
  formatBps,
  formatStable,
  liquidationRewardMicroStable,
} from "@/lib/protocol/math"
import { cn } from "@/lib/utils"
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

function ratioColor(ratio: bigint | null) {
  if (ratio === null || ratio >= 18_000n) return "text-emerald-400"
  if (ratio >= 15_000n) return "text-amber-400"
  return "text-red-400"
}

export default function LiquidatePage() {
  const { snapshot, actions, pendingAction, error, lastResult } = useProtocol()
  const queue = snapshot.liquidationQueue
  const liquidateStats = [
    { label: "Liquidatable now", value: snapshot.dashboard.liquidatableVaultCount.toString(), valueClassName: snapshot.dashboard.liquidatableVaultCount > 0n ? "text-red-400" : "text-emerald-400" },
    { label: "At-risk (ratio <180%)", value: snapshot.dashboard.atRiskVaultCount.toString(), valueClassName: snapshot.dashboard.atRiskVaultCount > 0n ? "text-amber-400" : "text-emerald-400" },
    { label: "Total liquidatable debt", value: formatStable(snapshot.dashboard.liquidatableDebtMicroStable) },
    { label: "Est. liquidator reward", value: formatStable(snapshot.dashboard.estimatedLiquidatorRewardMicroStable), valueClassName: "text-emerald-400" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {liquidateStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      {snapshot.dashboard.liquidatableVaultCount > 0n ? (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-xs text-red-400">
          <span className="font-medium">{snapshot.dashboard.liquidatableVaultCount.toString()} vaults</span> are below the liquidation threshold. Liquidation is full-only in v1.
        </div>
      ) : (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-xs text-emerald-400">
          No vaults are currently eligible for liquidation.
        </div>
      )}

      {(error || lastResult) && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-xs",
          error ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
        )}>
          {error ?? `${lastResult?.message} · tx ${lastResult?.txId}`}
        </div>
      )}

      <div className="bg-card border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {["Vault ID", "Collateral", "Debt", "Coll. Ratio", "Health", "Liq. Reward", "Action"].map((header) => (
                <TableHead key={header} className="text-[11px] font-medium text-muted-foreground">{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.map((vault) => (
              <TableRow key={vault.id.toString()} className="border-border text-xs">
                <TableCell className="font-semibold">
                  <Link href={`/vaults/${vault.id}`} className="hover:underline">#{vault.displayId}</Link>
                </TableCell>
                <TableCell>{formatAlgo(vault.collateralMicroAlgo)}</TableCell>
                <TableCell>{formatStable(vault.debtMicroStable)}</TableCell>
                <TableCell className={cn("font-semibold", ratioColor(vault.collateralRatioBps))}>
                  {formatBps(vault.collateralRatioBps)}
                </TableCell>
                <TableCell><StatusBadge status={vault.health === "warn" ? "at-risk" : vault.health} /></TableCell>
                <TableCell className={vault.isLiquidatable ? "font-semibold" : "text-muted-foreground"}>
                  {vault.isLiquidatable ? formatStable(liquidationRewardMicroStable(vault, snapshot.params.liquidationBonusBps)) : "Not eligible"}
                </TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    variant={vault.isLiquidatable ? "default" : "outline"}
                    disabled={!vault.isLiquidatable || pendingAction === "liquidate" || !snapshot.oracle.isFresh}
                    className="h-6 text-[11px] px-2.5"
                    onClick={() => actions.liquidateVault(vault.id)}
                    data-testid={`liquidate-${vault.id.toString()}`}
                  >
                    {pendingAction === "liquidate" ? "Simulating" : "Liquidate"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground/50 italic">
            Liquidation executes on-chain as a grouped stablecoin repayment plus protocol manager call. The contract rejects healthy vaults and stale prices.
          </p>
        </div>
      </div>

      {queue.length === 0 && (
        <div className="text-center">
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
            Return to dashboard
          </Link>
        </div>
      )}
    </div>
  )
}
