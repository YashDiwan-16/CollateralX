import { cn } from "@/lib/utils"

interface Step {
  label: string
  state: "done" | "current" | "pending"
}

const steps: Step[] = [
  { label: "Wallet connected", state: "done" },
  { label: "Review terms", state: "current" },
  { label: "Create vault", state: "pending" },
  { label: "Deposit collateral", state: "pending" },
  { label: "Mint algoUSD", state: "pending" },
]

export function StepFlow() {
  return (
    <div className="flex items-center gap-0 mb-7">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold mb-1.5",
                step.state === "done" && "bg-emerald-500/20 border border-emerald-500/40 text-emerald-400",
                step.state === "current" && "bg-background border-2 border-foreground/70 text-foreground",
                step.state === "pending" && "bg-muted border border-border text-muted-foreground"
              )}
            >
              {step.state === "done" ? "✓" : i + 1}
            </div>
            <span className="text-[10px] text-muted-foreground text-center leading-tight max-w-[64px]">
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px bg-border mx-2 mb-4" />
          )}
        </div>
      ))}
    </div>
  )
}
