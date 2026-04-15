"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { RiskMeter } from "@/components/shared/risk-meter"
import { ConfigRow } from "@/components/shared/config-row"
import { StatusBadge } from "@/components/shared/status-badge"
import { ActionTabs } from "@/components/pages/vault-detail/action-tabs"
import { buttonVariants } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import {
  formatAddressShort,
  formatAlgo,
  formatBps,
  formatStable,
  formatUsd,
  healthFactorLabel,
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

export default function VaultDetailPage() {
  const params = useParams<{ id: string }>()
  const { snapshot, actions, pendingAction, lastResult, error, activeAddress } = useProtocol()
  const rawId = params.id
  const vault = snapshot.vaults.find((candidate) => candidate.id.toString() === rawId || candidate.displayId === rawId)

  if (!vault) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center">
        <h1 className="text-sm font-semibold mb-2">Vault not found</h1>
        <p className="text-xs text-muted-foreground mb-4">
          The vault may have been closed and its box removed from protocol state.
        </p>
        <Link href="/vaults" className={cn(buttonVariants({ size: "sm" }))}>Back to my vaults</Link>
      </div>
    )
  }

  const ratioNumber = vault.collateralRatioBps === null ? 666 : Number(vault.collateralRatioBps / 100n)
  const isOwner = !activeAddress || vault.owner === activeAddress
  const txHistory = snapshot.events.slice(0, 4).map((event, index) => ({
    time: event.time,
    action: event.text.split(" ")[2] ?? "Protocol",
    amount: index === 0 ? formatStable(vault.debtMicroStable) : formatAlgo(vault.collateralMicroAlgo),
    ratioAfter: formatBps(vault.collateralRatioBps),
    hash: lastResult?.txId ?? "pending-indexer",
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/vaults" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 text-xs px-2 text-muted-foreground")}>
          Back to My Vaults
        </Link>
        <span className="text-sm font-semibold">Vault #{vault.displayId}</span>
        <StatusBadge status={vault.health === "warn" ? "warn" : vault.health} />
        {!isOwner && (
          <span className="text-[11px] text-muted-foreground">
            Owner {formatAddressShort(vault.owner)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Vault Summary</div>
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="pr-4 border-r border-border">
              <div className="text-[10px] text-muted-foreground mb-0.5">Collateral</div>
              <div className="text-lg font-semibold">{formatAlgo(vault.collateralMicroAlgo)}</div>
              <div className="text-[10px] text-muted-foreground">{formatUsd(vault.collateralValueMicroStable)}</div>
            </div>
            <div className="pr-4 border-r border-border">
              <div className="text-[10px] text-muted-foreground mb-0.5">Debt</div>
              <div className="text-lg font-semibold">{formatStable(vault.debtMicroStable)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-0.5">ALGO Price</div>
              <div className="text-lg font-semibold">{formatUsd(snapshot.oracle.pricePerAlgoMicroUsd, 4)}</div>
            </div>
          </div>
          <div className="pt-3 border-t border-border">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Collateral Ratio</span>
              <span className={cn("font-semibold", ratioNumber >= 180 ? "text-emerald-400" : ratioNumber >= 150 ? "text-amber-400" : "text-red-400")}>
                {formatBps(vault.collateralRatioBps)}
              </span>
            </div>
            <RiskMeter ratio={ratioNumber} className="mb-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>Liq. threshold {formatBps(snapshot.params.liquidationRatioBps, "")}</span>
              <span>Current {formatBps(vault.collateralRatioBps)}</span>
              <span>Safe target 180%+</span>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Risk Indicators</div>
          <div className="grid grid-cols-1 gap-3 mb-3 sm:grid-cols-2">
            <div className="bg-background rounded-md p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Health Factor</div>
              <div className={cn("text-2xl font-semibold", vault.isLiquidatable ? "text-red-400" : "text-emerald-400")}>
                {healthFactorLabel(vault, snapshot.params)}
              </div>
              <div className="text-[10px] text-muted-foreground">Safe above 1.00</div>
            </div>
            <div className="bg-background rounded-md p-3">
              <div className="text-[10px] text-muted-foreground mb-1">Liquidation Price</div>
              <div className="text-lg font-semibold">
                {vault.liquidationPriceMicroUsd ? formatUsd(vault.liquidationPriceMicroUsd, 4) : "No debt"}
              </div>
              <div className="text-[10px] text-muted-foreground">ALGO must stay above</div>
            </div>
          </div>
          <ConfigRow label="Max mintable" value={formatStable(vault.maxMintableMicroStable)} />
          <ConfigRow label="Available to withdraw" value={formatAlgo(vault.maxWithdrawableMicroAlgo)} />
          <ConfigRow label="Vault owner" value={formatAddressShort(vault.owner)} />
          <ConfigRow label="Oracle freshness" value={snapshot.oracle.isFresh ? "Fresh" : "Stale"} valueClassName={snapshot.oracle.isFresh ? "text-emerald-400" : "text-red-400"} />
        </div>
      </div>

      {vault.isLiquidatable && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          Liquidation danger: this vault is at or below the configured threshold. Deposits and repayments can restore health if you own it.
        </div>
      )}

      <ActionTabs
        vault={vault}
        snapshot={snapshot}
        actions={actions}
        pendingAction={pendingAction}
        lastResult={lastResult}
        error={error}
        isOwner={isOwner}
      />

      <div className="bg-card border border-border rounded-lg">
        <div className="px-4 pt-4 pb-2 text-xs font-medium text-muted-foreground">Transaction History</div>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              {["Time", "Action", "Amount", "Ratio After", "Tx Hash"].map((header) => (
                <TableHead key={header} className="text-[11px] font-medium text-muted-foreground">{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {txHistory.map((tx, index) => (
              <TableRow key={`${tx.time}-${index}`} className="border-border text-xs">
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
