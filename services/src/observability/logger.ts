export type LogLevel = "debug" | "info" | "warn" | "error"

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
}

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

function normalizeBigInts(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString()
  if (Array.isArray(value)) return value.map(normalizeBigInts)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, normalizeBigInts(entry)])
    )
  }
  return value
}

export class JsonConsoleLogger implements Logger {
  constructor(private readonly minLevel: LogLevel = "info") {}

  debug(message: string, fields: Record<string, unknown> = {}) {
    this.write("debug", message, fields)
  }

  info(message: string, fields: Record<string, unknown> = {}) {
    this.write("info", message, fields)
  }

  warn(message: string, fields: Record<string, unknown> = {}) {
    this.write("warn", message, fields)
  }

  error(message: string, fields: Record<string, unknown> = {}) {
    this.write("error", message, fields)
  }

  private write(level: LogLevel, message: string, fields: Record<string, unknown>) {
    if (levelRank[level] < levelRank[this.minLevel]) return
    const line = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(normalizeBigInts(fields) as Record<string, unknown>),
    }
    const output = JSON.stringify(line)
    if (level === "error") {
      console.error(output)
      return
    }
    console.log(output)
  }
}

export class MemoryLogger implements Logger {
  readonly entries: Array<{ level: LogLevel; message: string; fields: Record<string, unknown> }> = []

  debug(message: string, fields: Record<string, unknown> = {}) {
    this.entries.push({ level: "debug", message, fields })
  }

  info(message: string, fields: Record<string, unknown> = {}) {
    this.entries.push({ level: "info", message, fields })
  }

  warn(message: string, fields: Record<string, unknown> = {}) {
    this.entries.push({ level: "warn", message, fields })
  }

  error(message: string, fields: Record<string, unknown> = {}) {
    this.entries.push({ level: "error", message, fields })
  }
}
