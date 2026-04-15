import { cn } from "@/lib/utils"

type RiskLevel = "safe" | "warn" | "danger"

interface RiskMeterProps {
  ratio: number
  className?: string
}

function getRiskLevel(ratio: number): RiskLevel {
  if (ratio >= 180) return "safe"
  if (ratio >= 150) return "warn"
  return "danger"
}

function getBarWidth(ratio: number): string {
  // Map ratio 150-666% to 0-100% width
  const pct = Math.min(100, Math.max(0, ((ratio - 150) / (666 - 150)) * 100))
  return `${pct}%`
}

const trackColors: Record<RiskLevel, string> = {
  safe: "bg-emerald-500",
  warn: "bg-amber-500",
  danger: "bg-red-500",
}

export function RiskMeter({ ratio, className }: RiskMeterProps) {
  const level = getRiskLevel(ratio)
  return (
    <div className={cn("h-1.5 rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all", trackColors[level])}
        style={{ width: getBarWidth(ratio) }}
      />
    </div>
  )
}
