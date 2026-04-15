interface BarChartProps {
  bars: number[]
  height?: number
  color?: string
}

export function BarChart({ bars, height = 80, color = "bg-zinc-600 hover:bg-zinc-400" }: BarChartProps) {
  return (
    <div
      className="flex items-end gap-1 w-full rounded-md bg-muted/40 p-2 overflow-hidden"
      style={{ height }}
    >
      {bars.map((pct, i) => (
        <div
          key={i}
          className={`flex-1 rounded-sm transition-colors cursor-default ${color}`}
          style={{ height: `${pct}%` }}
        />
      ))}
    </div>
  )
}
