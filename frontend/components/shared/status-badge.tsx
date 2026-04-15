import { cn } from "@/lib/utils"

type Status = "safe" | "warn" | "danger" | "liquidatable" | "at-risk" | "closed"

const styles: Record<Status, string> = {
  safe: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  warn: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border border-red-500/20",
  liquidatable: "bg-red-500/10 text-red-400 border border-red-500/20",
  "at-risk": "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  closed: "bg-muted text-muted-foreground border border-border",
}

const labels: Record<Status, string> = {
  safe: "Safe",
  warn: "Warning",
  danger: "Danger",
  liquidatable: "Liquidatable",
  "at-risk": "At Risk",
  closed: "Closed",
}

interface StatusBadgeProps {
  status: Status
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium", styles[status], className)}>
      {labels[status]}
    </span>
  )
}
