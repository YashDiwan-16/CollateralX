"use client"

import { StatCard } from "@/components/shared/stat-card"
import { OracleStatus } from "@/components/shared/oracle-status"
import { ConfigRow } from "@/components/shared/config-row"
import { EventLog } from "@/components/shared/event-log"
import { StatusBadge } from "@/components/shared/status-badge"
import { Button } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import {
  formatAddressShort,
  formatAlgo,
  formatBps,
  formatStable,
  formatUnixTimestampUtc,
  formatUsd,
} from "@/lib/protocol/math"

export default function AdminPage() {
  const { snapshot } = useProtocol()
  const adminStats = [
    {
      label: "System collateral ratio",
      value: formatBps(snapshot.dashboard.systemCollateralRatioBps),
      valueClassName:
        snapshot.dashboard.systemCollateralRatioBps === null ||
        snapshot.dashboard.systemCollateralRatioBps >= snapshot.params.minCollateralRatioBps + 3_000n
          ? "text-emerald-400"
          : "text-amber-400",
    },
    { label: "Under-collateralized vaults", value: snapshot.dashboard.liquidatableVaultCount.toString(), valueClassName: snapshot.dashboard.liquidatableVaultCount > 0n ? "text-red-400" : "text-emerald-400" },
    { label: "Debt ceiling remaining", value: formatStable(snapshot.params.protocolDebtCeilingMicroStable - snapshot.status.totalDebtMicroStable) },
    { label: "Oracle staleness", value: snapshot.oracle.isFresh ? "0 events" : "1 event", valueClassName: snapshot.oracle.isFresh ? "text-emerald-400" : "text-red-400" },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-sm font-semibold">Admin / Operator Panel</h1>
        <StatusBadge status={snapshot.status.pauseFlags === 0n ? "safe" : "warn"} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Oracle Feed Status</div>
          <OracleStatus
            status={snapshot.oracle.isFresh ? "live" : "dead"}
            label={`ALGO/USD oracle - ${snapshot.oracle.isFresh ? "live and updating" : "stale or paused"}`}
          />
          <div className="mt-3 space-y-0">
            <ConfigRow label="Current price" value={formatUsd(snapshot.oracle.pricePerAlgoMicroUsd, 4)} />
            <ConfigRow label="Last round update" value={`#${snapshot.oracle.updatedRound.toLocaleString("en-US")}`} />
            <ConfigRow
              label="Last timestamp"
              value={formatUnixTimestampUtc(snapshot.oracle.updatedAt)}
              suppressHydrationWarning
            />
            <ConfigRow label="Stale threshold" value={`${snapshot.oracle.maxAgeSeconds.toString()}s`} />
            <div className="flex justify-between items-center py-2 border-b border-border text-xs">
              <span className="text-muted-foreground">Updater</span>
              <span className="font-mono text-[10px]">{formatAddressShort(snapshot.oracle.updater)}</span>
            </div>
            <ConfigRow label="Source" value={snapshot.oracle.source} />
            <ConfigRow label="Status" value={snapshot.oracle.isFresh ? "Healthy" : "Blocked"} valueClassName={snapshot.oracle.isFresh ? "text-emerald-400" : "text-red-400"} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Keeper / Liquidator Bot Status</div>
          <OracleStatus status={snapshot.keeper.status === "active" ? "live" : "warn"} label={`Keeper bot ${snapshot.keeper.status}`} />
          <div className="mt-3 space-y-0">
            <div className="flex justify-between items-center py-2 border-b border-border text-xs">
              <span className="text-muted-foreground">Bot wallet</span>
              <span className="font-mono text-[10px]">{formatAddressShort(snapshot.keeper.address)}</span>
            </div>
            <ConfigRow label="Last run" value={snapshot.keeper.lastRunLabel} />
            <ConfigRow label="Liquidations today" value={snapshot.keeper.liquidations24h.toString()} />
            <ConfigRow label="Vaults scanned / run" value={snapshot.keeper.scannedVaults.toString()} />
            <ConfigRow label="Liquidatable debt" value={formatStable(snapshot.dashboard.liquidatableDebtMicroStable)} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Protocol Configuration</div>
          <ConfigRow label="Min. collateral ratio" value={formatBps(snapshot.params.minCollateralRatioBps, "")} />
          <ConfigRow label="Liquidation threshold" value={formatBps(snapshot.params.liquidationRatioBps, "")} />
          <ConfigRow label="Liquidation penalty" value={formatBps(snapshot.params.liquidationPenaltyBps, "")} valueClassName="text-amber-400" />
          <ConfigRow label="Liquidation bonus" value={formatBps(snapshot.params.liquidationBonusBps, "")} valueClassName="text-amber-400" />
          <ConfigRow label="Global debt ceiling" value={formatStable(snapshot.params.protocolDebtCeilingMicroStable)} />
          <ConfigRow label="Per-vault debt ceiling" value={formatStable(snapshot.params.vaultMintCapMicroStable)} />
          <ConfigRow label="Total collateral" value={formatAlgo(snapshot.status.totalCollateralMicroAlgo)} />
          <ConfigRow label="Protocol paused" value={snapshot.status.pauseFlags === 0n ? "No" : `Flags ${snapshot.status.pauseFlags.toString()}`} valueClassName={snapshot.status.pauseFlags === 0n ? "text-emerald-400" : "text-red-400"} />
          <div className="flex gap-2 mt-4">
            <Button variant="secondary" size="sm" className="h-7 text-xs" disabled>
              Config changes are governance-only
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
              disabled
            >
              Emergency pause
            </Button>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="text-xs font-medium text-muted-foreground mb-3">Recent Admin / Protocol Events</div>
          <EventLog events={snapshot.events} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="text-xs font-medium text-muted-foreground mb-3">Protocol-level risk summary</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          {adminStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
        </div>
      </div>
    </div>
  )
}
