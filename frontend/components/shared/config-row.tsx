import { cn } from "@/lib/utils"

interface ConfigRowProps {
  label: string
  value: string
  valueClassName?: string
}

export function ConfigRow({ label, value, valueClassName }: ConfigRowProps) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border last:border-0 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-medium text-foreground", valueClassName)}>{value}</span>
    </div>
  )
}
