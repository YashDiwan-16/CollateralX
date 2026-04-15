import { cn } from "@/lib/utils"

type Status = "live" | "warn" | "dead"

interface OracleStatusProps {
  status?: Status
  label: string
}

export function OracleStatus({ status = "live", label }: OracleStatusProps) {
  const dotClass = {
    live: "bg-emerald-400",
    warn: "bg-amber-400",
    dead: "bg-red-400",
  }[status]

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          dotClass,
          status === "live" && "animate-pulse"
        )}
      />
      {label}
    </div>
  )
}
