import { cn } from "@/lib/utils"

interface StatCardProps {
  label: string
  value: string
  sub?: string
  valueClassName?: string
}

export function StatCard({ label, value, sub, valueClassName }: StatCardProps) {
  return (
    <div className="bg-card border border-border rounded-lg p-3.5">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-xl font-semibold tracking-tight", valueClassName)}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
