import { describe, expect, it } from "vitest"
import algosdk from "algosdk"
import { decodeKnownEventLog, selector } from "../src/chain/events"
import { OWNER } from "./fixtures"

function uint64(value: bigint) {
  const bytes = Buffer.alloc(8)
  bytes.writeBigUInt64BE(value)
  return bytes
}

describe("application event decoding", () => {
  it("decodes liquidation logs into indexed read-model events", () => {
    const liquidator = algosdk.generateAccount().addr.toString()
    const log = Buffer.concat([
      Buffer.from(selector("VaultLiquidatedEvent(uint64,address,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64)"), "hex"),
      uint64(7n),
      Buffer.from(algosdk.decodeAddress(OWNER).publicKey),
      Buffer.from(algosdk.decodeAddress(liquidator).publicKey),
      uint64(800_000_000n),
      uint64(600_000_000n),
      uint64(0n),
      uint64(0n),
      uint64(1_000_000n),
      uint64(100n),
      uint64(0n),
      uint64(0n),
    ]).toString("base64")

    const event = decodeKnownEventLog(log, { txId: "TX", timestamp: 1_700_000_000_000, logIndex: 0, round: 100n })

    expect(event?.type).toBe("liquidation")
    expect(event?.vaultId).toBe(7n)
    expect(event?.owner).toBe(OWNER)
    expect(event?.actor).toBe(liquidator)
    expect(event?.amountMicroStable).toBe(800_000_000n)
  })
})
