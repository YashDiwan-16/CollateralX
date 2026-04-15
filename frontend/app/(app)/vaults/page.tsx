"use client"

import Link from "next/link"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { buttonVariants } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import {
  formatAlgo,
  formatBps,
  formatStable,
  formatUsd,
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

function ratioColor(ratio: bigint | null) {
  if (ratio === null || ratio >= 18_000n) return "text-emerald-400"
  if (ratio >= 15_000n) return "text-amber-400"
  return "text-red-400"
}

export default function VaultsPage() {
  const { snapshot } = useProtocol()
  const vaults = snapshot.userVaults
  const totalCollateral = vaults.reduce((sum, vault) => sum + vault.collateralMicroAlgo, 0n)
  const totalDebt = vaults.reduce((sum, vault) => sum + vault.debtMicroStable, 0n)
  const totalValue = vaults.reduce((sum, vault) => sum + vault.collateralValueMicroStable, 0n)
  const avgRatio = totalDebt === 0n ? null : (totalValue * 10_000n) / totalDebt

  const vaultStats = [
    { label: "Total Collateral", value: formatAlgo(totalCollateral) },
    { label: "Total Debt", value: formatStable(totalDebt) },
    { label: "Avg. Collateral Ratio", value: formatBps(avgRatio), valueClassName: ratioColor(avgRatio) },
    { label: "Vault Count", value: vaults.length.toString() },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">My Vaults</h1>
        <Link href="/vaults/create" className={cn(buttonVariants({ size: "sm" }))}>
          + Create Vault
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {vaultStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </div>

      <div className="bg-card border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {["Vault", "Collateral", "Debt", "ALGO Price", "Coll. Ratio", "Liq. Price", "Status", "Actions"].map((header) => (
                <TableHead key={header} className="text-xs font-medium text-muted-foreground">{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vaults.map((vault) => (
              <TableRow key={vault.id.toString()} className="border-border text-xs">
                <TableCell className="font-semibold">#{vault.displayId}</TableCell>
                <TableCell>
                  <div>{formatAlgo(vault.collateralMicroAlgo)}</div>
                  <div className="text-[10px] text-muted-foreground">{formatUsd(vault.collateralValueMicroStable)}</div>
                </TableCell>
                <TableCell>{formatStable(vault.debtMicroStable)}</TableCell>
                <TableCell>{formatUsd(snapshot.oracle.pricePerAlgoMicroUsd, 4)}</TableCell>
                <TableCell className={cn("font-semibold", ratioColor(vault.collateralRatioBps))}>
                  {formatBps(vault.collateralRatioBps)}
                </TableCell>
                <TableCell>
                  {vault.liquidationPriceMicroUsd ? formatUsd(vault.liquidationPriceMicroUsd, 4) : "No debt"}
                </TableCell>
                <TableCell><StatusBadge status={vault.health === "warn" ? "warn" : vault.health} /></TableCell>
                <TableCell>
                  <div className="flex gap-1.5">
                    <Link href={`/vaults/${vault.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-6 text-[11px] px-2")}>View</Link>
                    <Link href={`/vaults/${vault.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-6 text-[11px] px-2")}>Manage</Link>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground/50 italic">
            Vaults are discovered from deterministic ids and box-backed records. Closed boxes disappear after protocol cleanup.
          </p>
        </div>
      </div>

      {vaults.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-lg p-8 text-center">
          <p className="text-xs text-muted-foreground mb-3">
            No vaults found for this wallet. Create one to start depositing ALGO collateral.
          </p>
          <Link href="/vaults/create" className={cn(buttonVariants({ size: "sm" }))}>
            + Create new vault
          </Link>
        </div>
      )}
    </div>
  )
}
