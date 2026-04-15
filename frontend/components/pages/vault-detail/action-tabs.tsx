"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const ALGO_PRICE = 0.3812
const COLLATERAL = 5000
const DEBT = 800
const MIN_RATIO = 1.5

function calcRatio(collateral: number, debt: number): number {
  if (debt === 0) return Infinity
  return Math.round(((collateral * ALGO_PRICE) / debt) * 100)
}

function calcLiqPrice(debt: number, collateral: number): string {
  if (collateral === 0) return "—"
  return `$${((debt * MIN_RATIO) / collateral).toFixed(3)}`
}

interface PreviewState {
  collateral: number
  debt: number
}

export function ActionTabs() {
  const [preview, setPreview] = useState<PreviewState>({ collateral: COLLATERAL, debt: DEBT })
  const [depositAmt, setDepositAmt] = useState("")
  const [mintAmt, setMintAmt] = useState("")

  function handleDeposit(val: string) {
    setDepositAmt(val)
    const extra = parseFloat(val) || 0
    setPreview({ collateral: COLLATERAL + extra, debt: DEBT })
  }

  function handleMint(val: string) {
    setMintAmt(val)
    const extra = parseFloat(val) || 0
    setPreview({ collateral: COLLATERAL, debt: DEBT + extra })
  }

  function handleRepay(val: string) {
    const pay = parseFloat(val) || 0
    setPreview({ collateral: COLLATERAL, debt: Math.max(0, DEBT - pay) })
  }

  function handleWithdraw(val: string) {
    const out = parseFloat(val) || 0
    setPreview({ collateral: Math.max(0, COLLATERAL - out), debt: DEBT })
  }

  const newRatio = calcRatio(preview.collateral, preview.debt)
  const newLiq = calcLiqPrice(preview.debt, preview.collateral)
  const ratioClass = newRatio >= 180 ? "text-emerald-400" : newRatio >= 150 ? "text-amber-400" : "text-red-400"

  const changed =
    preview.collateral !== COLLATERAL || preview.debt !== DEBT

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <Tabs defaultValue="deposit">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto pb-0 mb-4 gap-0">
          {["deposit", "mint", "repay", "withdraw"].map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs capitalize px-3.5 pb-2"
            >
              {tab === "deposit" ? "Deposit Collateral" : tab === "mint" ? "Mint algoUSD" : tab === "repay" ? "Repay Debt" : "Withdraw Collateral"}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-2 gap-5">
          <div>
            <TabsContent value="deposit" className="mt-0">
              <label className="block text-[11px] text-muted-foreground mb-1">Amount to deposit (ALGO)</label>
              <Input
                type="number"
                placeholder="e.g. 1000"
                className="h-8 text-xs bg-background"
                value={depositAmt}
                onChange={(e) => handleDeposit(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1 mb-3">Wallet balance: 12,400 ALGO available</p>
              <Button size="sm" className="w-full">Deposit ALGO</Button>
            </TabsContent>

            <TabsContent value="mint" className="mt-0">
              <label className="block text-[11px] text-muted-foreground mb-1">Amount to mint (algoUSD)</label>
              <Input
                type="number"
                placeholder="e.g. 200"
                className="h-8 text-xs bg-background"
                value={mintAmt}
                onChange={(e) => handleMint(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1 mb-3">
                Max mintable: 870 algoUSD (keeps ratio ≥150%)
              </p>
              {(parseFloat(mintAmt) || 0) > 0 && calcRatio(COLLATERAL, DEBT + (parseFloat(mintAmt) || 0)) < 200 && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 text-[11px] text-amber-400 mb-3">
                  Minting this amount reduces your ratio below 200%. Ensure you can handle price drops.
                </div>
              )}
              <Button size="sm" className="w-full">Mint algoUSD</Button>
            </TabsContent>

            <TabsContent value="repay" className="mt-0">
              <label className="block text-[11px] text-muted-foreground mb-1">Amount to repay (algoUSD)</label>
              <Input
                type="number"
                placeholder="e.g. 200"
                className="h-8 text-xs bg-background"
                onChange={(e) => handleRepay(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1 mb-3">
                Current debt: 800 algoUSD · Wallet balance: 320 algoUSD
              </p>
              <Button size="sm" className="w-full">Repay algoUSD</Button>
            </TabsContent>

            <TabsContent value="withdraw" className="mt-0">
              <label className="block text-[11px] text-muted-foreground mb-1">Amount to withdraw (ALGO)</label>
              <Input
                type="number"
                placeholder="e.g. 500"
                className="h-8 text-xs bg-background"
                onChange={(e) => handleWithdraw(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground mt-1 mb-3">
                Max withdrawable: 2,802 ALGO (maintains 150% ratio)
              </p>
              {preview.collateral < COLLATERAL && calcRatio(preview.collateral, DEBT) < 180 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-[11px] text-red-400 mb-3">
                  Withdrawing this amount brings ratio below safe threshold.
                </div>
              )}
              <Button size="sm" className="w-full">Withdraw ALGO</Button>
            </TabsContent>
          </div>

          {/* Preview */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Transaction Preview</div>
            <div className="bg-background rounded-md p-3 space-y-0">
              {[
                [
                  "Collateral",
                  changed
                    ? `${COLLATERAL.toLocaleString()} ALGO → `
                    : `${COLLATERAL.toLocaleString()} ALGO`,
                  changed ? `${preview.collateral.toLocaleString()} ALGO` : "",
                ],
                [
                  "Debt",
                  changed ? `${DEBT} algoUSD → ` : `${DEBT} algoUSD`,
                  changed ? `${preview.debt} algoUSD` : "",
                ],
              ].map(([label, base, after]) => (
                <div key={label as string} className="flex justify-between py-2 border-b border-border last:border-0 text-xs">
                  <span className="text-muted-foreground">{label}</span>
                  <span>
                    {base}
                    {after && <span className="text-amber-400">{after}</span>}
                  </span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-b border-border text-xs">
                <span className="text-muted-foreground">New ratio</span>
                <span className={cn("font-medium", ratioClass)}>
                  {isFinite(newRatio) ? `${newRatio}%` : "∞"}
                </span>
              </div>
              <div className="flex justify-between py-2 text-xs">
                <span className="text-muted-foreground">New liq. price</span>
                <span>{newLiq}</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 italic mt-2">
              Preview updates as you type. Amber values = change from current.
            </p>
          </div>
        </div>
      </Tabs>
    </div>
  )
}
