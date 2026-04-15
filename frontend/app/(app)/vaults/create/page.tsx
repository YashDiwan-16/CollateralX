"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { StepFlow } from "@/components/pages/create-vault/step-flow"
import { ConfigRow } from "@/components/shared/config-row"
import { OracleStatus } from "@/components/shared/oracle-status"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useProtocol } from "@/providers/protocol-provider"
import {
  collateralRatioBps,
  decimalToMicro,
  formatAddressShort,
  formatAlgo,
  formatBps,
  formatStable,
  formatUsd,
  liquidationPriceMicroUsd,
  maxSafeDebtMicroStable,
} from "@/lib/protocol/math"

export default function CreateVaultPage() {
  const router = useRouter()
  const { snapshot, actions, pendingAction, error, lastResult, activeAddress } = useProtocol()
  const [collateral, setCollateral] = useState("")
  const [mintAmount, setMintAmount] = useState("")

  const collateralMicroAlgo = decimalToMicro(collateral)
  const mintMicroStable = decimalToMicro(mintAmount)
  const ratio = collateralRatioBps(collateralMicroAlgo, mintMicroStable, snapshot.oracle.pricePerAlgoMicroUsd)
  const liquidationPrice = liquidationPriceMicroUsd(
    mintMicroStable,
    collateralMicroAlgo,
    snapshot.params.liquidationRatioBps
  )
  const maxMint = collateralMicroAlgo > 0n
    ? maxSafeDebtMicroStable(
        collateralMicroAlgo,
        snapshot.oracle.pricePerAlgoMicroUsd,
        snapshot.params.minCollateralRatioBps
      )
    : 0n
  const validation =
    mintMicroStable > maxMint
      ? "Initial mint would place the vault below the minimum collateral ratio."
      : snapshot.status.totalDebtMicroStable + mintMicroStable > snapshot.params.protocolDebtCeilingMicroStable
        ? "Protocol debt ceiling would be exceeded."
        : null
  const ratioClass =
    ratio === null || ratio >= 18_000n ? "text-emerald-400" : ratio >= 15_000n ? "text-amber-400" : "text-red-400"

  async function submit() {
    const result = await actions.createVault({
      initialCollateralMicroAlgo: collateralMicroAlgo,
      initialMintMicroStable: mintMicroStable,
    })
    if (result.vaultId) router.push(`/vaults/${result.vaultId.toString()}`)
  }

  return (
    <div className="space-y-5">
      <h1 className="text-sm font-semibold">Create New Vault</h1>

      <StepFlow />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3">Step 2 - Review key parameters</div>
            <ConfigRow label="Collateral type" value="ALGO" />
            <ConfigRow label="Min. collateral ratio" value={formatBps(snapshot.params.minCollateralRatioBps, "")} />
            <ConfigRow label="Liquidation threshold" value={formatBps(snapshot.params.liquidationRatioBps, "")} />
            <ConfigRow label="Liquidation penalty" value={formatBps(snapshot.params.liquidationPenaltyBps, "")} valueClassName="text-amber-400" />
            <ConfigRow label="Debt floor" value={formatStable(snapshot.params.minDebtFloorMicroStable)} />
            <ConfigRow label="Debt ceiling (per vault)" value={formatStable(snapshot.params.vaultMintCapMicroStable)} />
            <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 text-[11px] text-amber-400">
              If ALGO price drops and your ratio falls below the liquidation threshold, the vault can be fully liquidated.
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3">Vault creation preview</div>
            <div className="space-y-3 mb-4">
              <div>
                <label htmlFor="create-collateral" className="block text-[11px] text-muted-foreground mb-1">
                  Initial collateral (ALGO)
                </label>
                <Input
                  id="create-collateral"
                  type="number"
                  min="0"
                  step="0.000001"
                  placeholder="e.g. 2000"
                  className="h-8 text-xs bg-background"
                  value={collateral}
                  onValueChange={setCollateral}
                  data-testid="create-collateral"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Max mint at current price: {formatStable(maxMint)}
                </p>
              </div>
              <div>
                <label htmlFor="create-mint" className="block text-[11px] text-muted-foreground mb-1">
                  Initial mint (algoUSD) - optional
                </label>
                <Input
                  id="create-mint"
                  type="number"
                  min="0"
                  step="0.000001"
                  placeholder="Leave blank to mint later"
                  className="h-8 text-xs bg-background"
                  value={mintAmount}
                  onValueChange={setMintAmount}
                  data-testid="create-mint"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Oracle price: {formatUsd(snapshot.oracle.pricePerAlgoMicroUsd, 4)}
                </p>
              </div>
            </div>
            {validation && (
              <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-[11px] text-red-400">
                {validation}
              </div>
            )}
            <div className="bg-background rounded-md p-3 space-y-0">
              {[
                ["Estimated ratio", ratio !== null ? <span className={ratioClass}>{formatBps(ratio)}</span> : <span className="text-muted-foreground">No debt</span>],
                ["Liquidation price", liquidationPrice ? formatUsd(liquidationPrice, 4) : <span className="text-muted-foreground">No debt</span>],
                ["Initial collateral", formatAlgo(collateralMicroAlgo)],
                ["Initial debt", formatStable(mintMicroStable)],
              ].map(([label, value], index) => (
                <div key={index} className="flex justify-between py-2 border-b border-border last:border-0 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value as React.ReactNode}</span>
                </div>
              ))}
            </div>
            <Button
              className="w-full mt-3"
              size="sm"
              disabled={pendingAction === "createVault" || Boolean(validation)}
              onClick={submit}
              data-testid="create-submit"
            >
              {pendingAction === "createVault" ? "Simulating..." : "Create vault"}
            </Button>
            {error && <p className="text-[11px] text-red-400 mt-2" role="alert">{error}</p>}
            {lastResult?.vaultId && <p className="text-[11px] text-emerald-400 mt-2">{lastResult.message}</p>}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Wallet and oracle</div>
            <OracleStatus status={snapshot.oracle.isFresh ? "live" : "warn"} label={`ALGO/USD oracle - ${snapshot.oracle.isFresh ? "fresh" : "stale"}`} />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Wallet: {activeAddress ? formatAddressShort(activeAddress) : "Demo wallet"} · Data mode: {snapshot.mode}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
