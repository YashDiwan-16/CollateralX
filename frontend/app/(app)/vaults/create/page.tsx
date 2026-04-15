"use client"

import { useState } from "react"
import { StepFlow } from "@/components/pages/create-vault/step-flow"
import { ConfigRow } from "@/components/shared/config-row"
import { OracleStatus } from "@/components/shared/oracle-status"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const ALGO_PRICE = 0.3812
const MIN_RATIO = 1.5

function calcRatio(collateral: number, mint: number): number | null {
  if (!collateral || !mint) return null
  return Math.round(((collateral * ALGO_PRICE) / mint) * 100)
}

function calcLiqPrice(mint: number, collateral: number): string | null {
  if (!mint || !collateral) return null
  return `$${((mint * MIN_RATIO) / collateral).toFixed(3)}`
}

export default function CreateVaultPage() {
  const [collateral, setCollateral] = useState("")
  const [mintAmt, setMintAmt] = useState("")

  const col = parseFloat(collateral) || 0
  const mint = parseFloat(mintAmt) || 0
  const ratio = calcRatio(col, mint)
  const liqPrice = calcLiqPrice(mint, col)
  const maxMint = col > 0 ? (col * ALGO_PRICE) / MIN_RATIO : 0
  const ratioClass =
    ratio === null ? "text-muted-foreground"
    : ratio >= 180 ? "text-emerald-400"
    : ratio >= 150 ? "text-amber-400"
    : "text-red-400"

  return (
    <div className="space-y-5">
      <h1 className="text-sm font-semibold">Create New Vault</h1>

      <StepFlow />

      <div className="grid grid-cols-2 gap-4">
        {/* Terms */}
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3">Step 2 — Review key parameters</div>
            <ConfigRow label="Collateral type" value="ALGO" />
            <ConfigRow label="Min. collateral ratio" value="150%" />
            <ConfigRow label="Liquidation threshold" value="150%" />
            <ConfigRow label="Liquidation penalty" value="13%" valueClassName="text-amber-400" />
            <ConfigRow label="Stability fee" value="2.5% / year" />
            <ConfigRow label="Debt ceiling (per vault)" value="50,000 algoUSD" />
            <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 text-[11px] text-amber-400">
              If the ALGO price drops and your ratio falls below 150%, your vault will be liquidated with a 13% penalty.
            </div>
            <Button className="w-full mt-3" size="sm">I understand — continue</Button>
          </div>
        </div>

        <div className="space-y-4">
          {/* Vault preview */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground mb-3">Vault creation preview</div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Initial collateral (ALGO)</label>
                <Input
                  type="number"
                  placeholder="e.g. 2000"
                  className="h-8 text-xs bg-background"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Wallet: 12,400 ALGO
                  {col > 0 && ` · Max mint at 150%: ${maxMint.toFixed(0)} algoUSD`}
                </p>
              </div>
              <div>
                <label className="block text-[11px] text-muted-foreground mb-1">Initial mint (algoUSD) — optional</label>
                <Input
                  type="number"
                  placeholder="Leave blank to mint later"
                  className="h-8 text-xs bg-background"
                  value={mintAmt}
                  onChange={(e) => setMintAmt(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Max at 150%: {col > 0 ? `${maxMint.toFixed(0)} algoUSD` : "depends on collateral above"}
                </p>
              </div>
            </div>
            {ratio !== null && ratio < 150 && (
              <div className="mb-3 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-[11px] text-red-400">
                Ratio would be {ratio}% — below the 150% minimum. Reduce mint amount.
              </div>
            )}
            <div className="bg-background rounded-md p-3 space-y-0">
              {[
                ["Estimated ratio", ratio !== null ? <span className={ratioClass}>{ratio}%</span> : <span className="text-muted-foreground">—</span>],
                ["Liquidation price", liqPrice ?? <span className="text-muted-foreground">—</span>],
                ["Network fee", "~0.001 ALGO"],
              ].map(([label, val], i) => (
                <div key={i} className="flex justify-between py-2 border-b border-border last:border-0 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{val as React.ReactNode}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Wallet */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs font-medium text-muted-foreground mb-2">Connected wallet</div>
            <OracleStatus status="live" label="ALGO…7f4a — connected" />
            <p className="text-[11px] text-muted-foreground mt-1.5">Balance: 12,400 ALGO · 320 algoUSD</p>
          </div>
        </div>
      </div>
    </div>
  )
}
