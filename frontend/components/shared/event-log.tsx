import { cn } from "@/lib/utils"

type DotColor = "green" | "amber" | "red" | "default"

export interface EventItem {
  color: DotColor
  time: string
  text: string
}

interface EventLogProps {
  events: EventItem[]
}

const dotColors: Record<DotColor, string> = {
  green: "bg-emerald-400",
  amber: "bg-amber-400",
  red: "bg-red-400",
  default: "bg-border",
}

export function EventLog({ events }: EventLogProps) {
  return (
    <div className="space-y-0">
      {events.map((e, i) => (
        <div key={i} className="flex gap-2.5 py-2 border-b border-border last:border-0 text-xs">
          <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1", dotColors[e.color])} />
          <span className="text-muted-foreground min-w-[44px]">{e.time}</span>
          <span className="text-foreground/80">{e.text}</span>
        </div>
      ))}
    </div>
  )
}
