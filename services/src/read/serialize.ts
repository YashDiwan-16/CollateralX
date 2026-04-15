export function serialize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString()
  if (value instanceof Set) return [...value].map(serialize)
  if (Array.isArray(value)) return value.map(serialize)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, serialize(entry)])
    )
  }
  return value
}
