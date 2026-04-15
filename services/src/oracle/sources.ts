import type { OraclePriceSource } from "../ports"
import type { OracleSample } from "../domain/types"

export class StaticOracleSource implements OraclePriceSource {
  constructor(
    private readonly pricePerAlgoMicroUsd: bigint,
    private readonly source: string
  ) {}

  async readPrice() {
    return {
      pricePerAlgoMicroUsd: this.pricePerAlgoMicroUsd,
      source: this.source,
    }
  }
}

export class HttpJsonOracleSource implements OraclePriceSource {
  constructor(
    private readonly url: string,
    private readonly source: string
  ) {}

  async readPrice(currentOracle?: OracleSample) {
    const response = await fetch(this.url)
    if (!response.ok) throw new Error(`oracle source returned HTTP ${response.status}`)
    const body = await response.json() as {
      pricePerAlgoMicroUsd?: string | number
      price?: string | number
      updatedAt?: string | number
      updatedRound?: string | number
      source?: string
    }

    const price = body.pricePerAlgoMicroUsd ?? body.price
    if (price === undefined) throw new Error("oracle source response missing price")
    return {
      pricePerAlgoMicroUsd: BigInt(price),
      updatedAt: body.updatedAt === undefined ? undefined : BigInt(body.updatedAt),
      updatedRound: body.updatedRound === undefined ? undefined : BigInt(body.updatedRound),
      source: body.source ?? this.source ?? currentOracle?.source ?? "http:v1",
    }
  }
}
