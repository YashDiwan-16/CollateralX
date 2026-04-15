import type { Logger } from "../observability/logger"

export interface RetryPolicy {
  attempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export async function withRetry<T>(
  label: string,
  policy: RetryPolicy,
  work: (attempt: number) => Promise<T>,
  logger?: Logger
): Promise<T> {
  let lastError: unknown
  const attempts = Math.max(1, policy.attempts)

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work(attempt)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const delayMs = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1))
      logger?.warn("retrying failed operation", {
        label,
        attempt,
        nextAttempt: attempt + 1,
        delayMs,
        error: error instanceof Error ? error.message : String(error),
      })
      await sleep(delayMs)
    }
  }

  throw lastError
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
