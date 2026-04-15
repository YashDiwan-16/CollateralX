/**
 * Safe integer math helpers (bigint).
 *
 * Rounding policy:
 *  - All values that favour the PROTOCOL (collateral seized, debt ceiling
 *    comparisons) round DOWN so the protocol is never over-committed.
 *  - Values that favour the USER (max mintable) also round DOWN so users
 *    never receive more than is safe.
 *  - `mulDivUp` is provided for the one case where ceiling division is
 *    semantically correct (e.g. minimum collateral required for a given debt).
 *
 * No floating-point arithmetic is used anywhere in this file.
 */

import { ProtocolError } from "./errors"
import { err, ok, type Result } from "./types"

/**
 * Multiply `a × b` then divide by `c`, rounding toward zero (floor for positive values).
 *
 * Avoids intermediate overflow because bigint has arbitrary precision.
 * Equivalent to the AVM WideRatio opcode for on-chain use.
 */
export function mulDiv(a: bigint, b: bigint, c: bigint): Result<bigint, ProtocolError> {
  if (c === 0n) return err(ProtocolError.DIVISION_BY_ZERO)
  return ok((a * b) / c)
}

/**
 * Multiply `a × b` then divide by `c`, rounding up (ceiling division).
 * Only valid for non-negative operands.
 */
export function mulDivUp(a: bigint, b: bigint, c: bigint): Result<bigint, ProtocolError> {
  if (c === 0n) return err(ProtocolError.DIVISION_BY_ZERO)
  // ceiling = (a*b + c - 1) / c
  return ok((a * b + c - 1n) / c)
}

/**
 * Unwrap a Result or throw — for use only inside other math helpers where
 * the inputs have already been validated.
 * @internal
 */
export function unwrap<T>(result: Result<T, ProtocolError>): T {
  if (!result.ok) throw new Error(`Unexpected math error: ${result.error}`)
  return result.value
}
