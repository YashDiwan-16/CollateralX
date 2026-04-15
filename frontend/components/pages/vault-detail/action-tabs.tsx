"use client"

import { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  decimalToMicro,
  formatAlgo,
  formatBps,
  formatStable,
  formatUsd,
  isOracleStale,
  projectVaultAction,
} from "@/lib/protocol/math"
import type {
  ProtocolAction,
  ProtocolActionResult,
  ProtocolActions,
  ProtocolSnapshot,
  VaultView,
} from "@/lib/protocol/types"
import { cn } from "@/lib/utils"

interface ActionTabsProps {
  vault: VaultView
  snapshot: ProtocolSnapshot
  actions: ProtocolActions
  pendingAction: ProtocolAction | null
  lastResult: ProtocolActionResult | null
  error: string | null
  isOwner: boolean
}

type FormKey = "deposit" | "mint" | "repay" | "withdraw" | "liquidate"

const formLabels: Record<FormKey, string> = {
  deposit: "Deposit Collateral",
  mint: "Mint algoUSD",
  repay: "Repay Debt",
  withdraw: "Withdraw Collateral",
  liquidate: "Liquidate",
}

function amountFor(values: Record<FormKey, string>, key: FormKey) {
  return decimalToMicro(values[key])
}

function oracleIsStale(snapshot: ProtocolSnapshot) {
  return isOracleStale(
    BigInt(Math.floor(Date.now() / 1000)),
    snapshot.oracle.updatedAt,
    snapshot.oracle.maxAgeSeconds,
    snapshot.oracle.isFresh
  )
}

function validationMessage(args: {
  key: FormKey
  amount: bigint
  vault: VaultView
  snapshot: ProtocolSnapshot
  isOwner: boolean
}) {
  const { key, amount, vault, snapshot, isOwner } = args
  if (key !== "liquidate" && amount <= 0n) return "Enter an amount greater than zero."
  if (key !== "liquidate" && !isOwner) return "Only the vault owner can submit this action."
  if ((key === "mint" || key === "withdraw" || key === "liquidate") && oracleIsStale(snapshot)) {
    return "Oracle price is stale. This action is blocked until a fresh update arrives."
  }
  if (key === "mint" && amount > vault.maxMintableMicroStable) return "Mint amount exceeds the safe limit."
  if (key === "repay" && amount > vault.debtMicroStable) return "Repay amount exceeds outstanding debt."
  if (key === "withdraw" && amount > vault.maxWithdrawableMicroAlgo) return "Withdrawal would make the vault unhealthy."
  if (key === "liquidate" && !vault.isLiquidatable) return "Vault is healthy and cannot be liquidated."
  return null
}

export function ActionTabs({
  vault,
  snapshot,
  actions,
  pendingAction,
  lastResult,
  error,
  isOwner,
}: ActionTabsProps) {
  const [values, setValues] = useState<Record<FormKey, string>>({
    deposit: "",
    mint: "",
    repay: "",
    withdraw: "",
    liquidate: "",
  })
  const [activeKey, setActiveKey] = useState<FormKey>("deposit")

  function setValue(key: FormKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function previewFor(key: FormKey) {
    if (key === "liquidate") return vault
    const amount = amountFor(values, key)
    if (amount <= 0n) return vault
    return projectVaultAction(
      vault,
      key,
      amount,
      snapshot.params,
      snapshot.oracle.pricePerAlgoMicroUsd,
      snapshot.status.totalDebtMicroStable
    )
  }

  async function submit(key: FormKey) {
    const amount = amountFor(values, key)
    if (key === "deposit") await actions.depositCollateral(vault.id, amount)
    if (key === "mint") await actions.mintStablecoin(vault.id, amount)
    if (key === "repay") await actions.repayStablecoin(vault.id, amount)
    if (key === "withdraw") await actions.withdrawCollateral(vault.id, amount)
    if (key === "liquidate") await actions.liquidateVault(vault.id)
    setValue(key, "")
  }

  const preview = activeKey === "liquidate" ? vault : previewFor(activeKey)

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <Tabs defaultValue="deposit">
        <TabsList className="w-full justify-start bg-transparent border-b border-border rounded-none h-auto pb-0 mb-4 gap-0 overflow-x-auto">
          {(["deposit", "mint", "repay", "withdraw", ...(vault.isLiquidatable ? ["liquidate"] : [])] as FormKey[]).map((tab) => (
            <TabsTrigger
              key={tab}
              value={tab}
              onClick={() => setActiveKey(tab)}
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none text-xs capitalize px-3.5 pb-2"
            >
              {formLabels[tab]}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <ActionForm
              formKey="deposit"
              label="Amount to deposit (ALGO)"
              helper="The app call requires a grouped ALGO payment from the vault owner to the protocol app address."
              value={values.deposit}
              pending={pendingAction === "deposit"}
              validation={validationMessage({ key: "deposit", amount: amountFor(values, "deposit"), vault, snapshot, isOwner })}
              preview={previewFor("deposit")}
              vault={vault}
              onChange={(value) => setValue("deposit", value)}
              onSubmit={() => submit("deposit")}
            />
            <ActionForm
              formKey="mint"
              label="Amount to mint (algoUSD)"
              helper={`Max mintable: ${formatStable(vault.maxMintableMicroStable)}. The contract re-checks oracle freshness and debt ceilings on-chain.`}
              value={values.mint}
              pending={pendingAction === "mint"}
              validation={validationMessage({ key: "mint", amount: amountFor(values, "mint"), vault, snapshot, isOwner })}
              preview={previewFor("mint")}
              vault={vault}
              onChange={(value) => setValue("mint", value)}
              onSubmit={() => submit("mint")}
            />
            <ActionForm
              formKey="repay"
              label="Amount to repay (algoUSD)"
              helper={`Current debt: ${formatStable(vault.debtMicroStable)}. Repay uses a grouped stablecoin ASA transfer into the controller.`}
              value={values.repay}
              pending={pendingAction === "repay"}
              validation={validationMessage({ key: "repay", amount: amountFor(values, "repay"), vault, snapshot, isOwner })}
              preview={previewFor("repay")}
              vault={vault}
              onChange={(value) => setValue("repay", value)}
              onSubmit={() => submit("repay")}
            />
            <ActionForm
              formKey="withdraw"
              label="Amount to withdraw (ALGO)"
              helper={`Max withdrawable: ${formatAlgo(vault.maxWithdrawableMicroAlgo)}. Health is checked after the withdrawal amount is applied.`}
              value={values.withdraw}
              pending={pendingAction === "withdraw"}
              validation={validationMessage({ key: "withdraw", amount: amountFor(values, "withdraw"), vault, snapshot, isOwner })}
              preview={previewFor("withdraw")}
              vault={vault}
              onChange={(value) => setValue("withdraw", value)}
              onSubmit={() => submit("withdraw")}
            />
            {vault.isLiquidatable && (
              <TabsContent value="liquidate" className="mt-0">
                <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-[11px] text-red-300 mb-3">
                  Full liquidation repays {formatStable(vault.debtMicroStable)} and seizes collateral according to the configured bonus.
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={pendingAction === "liquidate" || Boolean(validationMessage({ key: "liquidate", amount: 1n, vault, snapshot, isOwner: true }))}
                  onClick={() => submit("liquidate")}
                  data-testid="liquidate-submit"
                >
                  {pendingAction === "liquidate" ? "Simulating..." : "Liquidate Vault"}
                </Button>
              </TabsContent>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Transaction Preview</div>
            <PreviewCard current={vault} preview={preview} />
            <div className="mt-3 rounded-md border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
              Pre-check: risky actions are simulated before submit in chain mode and are projected locally in demo mode.
            </div>
            {lastResult && (
              <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-300">
                {lastResult.message} · tx {lastResult.txId}
              </div>
            )}
            {error && (
              <div className="mt-3 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300" role="alert">
                {error}
              </div>
            )}
          </div>
        </div>
      </Tabs>
    </div>
  )
}

interface ActionFormProps {
  formKey: Exclude<FormKey, "liquidate">
  label: string
  helper: string
  value: string
  pending: boolean
  validation: string | null
  preview: VaultView
  vault: VaultView
  onChange(value: string): void
  onSubmit(): void
}

function ActionForm({
  formKey,
  label,
  helper,
  value,
  pending,
  validation,
  preview,
  vault,
  onChange,
  onSubmit,
}: ActionFormProps) {
  const changed =
    preview.collateralMicroAlgo !== vault.collateralMicroAlgo ||
    preview.debtMicroStable !== vault.debtMicroStable
  const danger = preview.health === "danger" || preview.health === "liquidatable"

  return (
    <TabsContent value={formKey} className="mt-0">
      <label htmlFor={`${formKey}-amount`} className="block text-[11px] text-muted-foreground mb-1">
        {label}
      </label>
      <Input
        id={`${formKey}-amount`}
        type="number"
        min="0"
        step="0.000001"
        placeholder={formKey === "mint" || formKey === "repay" ? "e.g. 200" : "e.g. 1000"}
        className="h-8 text-xs bg-background"
        value={value}
        onValueChange={onChange}
        aria-invalid={Boolean(validation && value)}
        data-testid={`${formKey}-amount`}
      />
      <p className="text-[10px] text-muted-foreground mt-1 mb-3">{helper}</p>
      {changed && danger && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-[11px] text-red-400 mb-3">
          This action would leave the vault in a dangerous state.
        </div>
      )}
      {validation && value && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2 text-[11px] text-amber-400 mb-3">
          {validation}
        </div>
      )}
      <Button
        size="sm"
        className="w-full"
        disabled={pending || Boolean(validation)}
        onClick={onSubmit}
        data-testid={`${formKey}-submit`}
      >
        {pending ? "Simulating..." : formLabels[formKey]}
      </Button>
    </TabsContent>
  )
}

function PreviewCard({ current, preview }: { current: VaultView; preview: VaultView }) {
  const changed =
    preview.collateralMicroAlgo !== current.collateralMicroAlgo ||
    preview.debtMicroStable !== current.debtMicroStable
  const ratioClass =
    preview.collateralRatioBps === null || preview.collateralRatioBps >= 18_000n
      ? "text-emerald-400"
      : preview.collateralRatioBps >= 15_000n
        ? "text-amber-400"
        : "text-red-400"

  return (
    <div className="bg-background rounded-md p-3 space-y-0">
      <PreviewRow
        label="Collateral"
        before={formatAlgo(current.collateralMicroAlgo)}
        after={changed ? formatAlgo(preview.collateralMicroAlgo) : undefined}
      />
      <PreviewRow
        label="Debt"
        before={formatStable(current.debtMicroStable)}
        after={changed ? formatStable(preview.debtMicroStable) : undefined}
      />
      <div className="flex justify-between py-2 border-b border-border text-xs">
        <span className="text-muted-foreground">New ratio</span>
        <span className={cn("font-medium", ratioClass)}>
          {formatBps(preview.collateralRatioBps)}
        </span>
      </div>
      <div className="flex justify-between py-2 text-xs">
        <span className="text-muted-foreground">New liq. price</span>
        <span>{preview.liquidationPriceMicroUsd ? formatUsd(preview.liquidationPriceMicroUsd, 4) : "No debt"}</span>
      </div>
    </div>
  )
}

function PreviewRow({ label, before, after }: { label: string; before: string; after?: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-border text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span>
        {before}
        {after && <span className="text-amber-400"> -&gt; {after}</span>}
      </span>
    </div>
  )
}
