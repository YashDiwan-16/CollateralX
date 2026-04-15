export interface MetricsSink {
  increment(name: string, value?: number, tags?: Record<string, string>): void
  gauge(name: string, value: number, tags?: Record<string, string>): void
  observe(name: string, value: number, tags?: Record<string, string>): void
}

export class NoopMetricsSink implements MetricsSink {
  increment() {}
  gauge() {}
  observe() {}
}

export class InMemoryMetricsSink implements MetricsSink {
  readonly counters = new Map<string, number>()
  readonly gauges = new Map<string, number>()
  readonly observations = new Map<string, number[]>()

  increment(name: string, value = 1, tags: Record<string, string> = {}) {
    const key = metricKey(name, tags)
    this.counters.set(key, (this.counters.get(key) ?? 0) + value)
  }

  gauge(name: string, value: number, tags: Record<string, string> = {}) {
    this.gauges.set(metricKey(name, tags), value)
  }

  observe(name: string, value: number, tags: Record<string, string> = {}) {
    const key = metricKey(name, tags)
    const values = this.observations.get(key) ?? []
    values.push(value)
    this.observations.set(key, values)
  }
}

export function metricKey(name: string, tags: Record<string, string>) {
  const tagSuffix = Object.entries(tags)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",")
  return tagSuffix ? `${name}{${tagSuffix}}` : name
}
