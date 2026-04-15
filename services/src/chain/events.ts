import { createHash } from "node:crypto"
import algosdk from "algosdk"
import type { IndexedEvent } from "../domain/types"

type EventArgType = "address" | "uint64"

interface KnownEvent {
  signature: string
  type: string
  args: EventArgType[]
  map(values: Array<string | bigint>, context: EventContext): IndexedEvent
}

export interface EventContext {
  txId: string
  round?: bigint
  timestamp: number
  logIndex: number
}

const knownEvents: KnownEvent[] = [
  {
    signature: "VaultCreatedEvent(uint64,address,uint64)",
    type: "vault_created",
    args: ["uint64", "address", "uint64"],
    map: ([vaultId, owner], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "vault_created",
      vaultId: vaultId as bigint,
      owner: owner as string,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
    }),
  },
  {
    signature: "CollateralDepositedEvent(uint64,address,uint64,uint64,uint64)",
    type: "collateral_deposited",
    args: ["uint64", "address", "uint64", "uint64", "uint64"],
    map: ([vaultId, owner, amountMicroAlgo], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "collateral_deposited",
      vaultId: vaultId as bigint,
      owner: owner as string,
      amountMicroAlgo: amountMicroAlgo as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
    }),
  },
  {
    signature: "StablecoinMintedEvent(uint64,address,uint64,uint64,uint64)",
    type: "stablecoin_minted",
    args: ["uint64", "address", "uint64", "uint64", "uint64"],
    map: ([vaultId, owner, amountMicroStable], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "stablecoin_minted",
      vaultId: vaultId as bigint,
      owner: owner as string,
      amountMicroStable: amountMicroStable as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
    }),
  },
  {
    signature: "StablecoinRepaidEvent(uint64,address,uint64,uint64,uint64)",
    type: "stablecoin_repaid",
    args: ["uint64", "address", "uint64", "uint64", "uint64"],
    map: ([vaultId, owner, amountMicroStable], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "stablecoin_repaid",
      vaultId: vaultId as bigint,
      owner: owner as string,
      amountMicroStable: amountMicroStable as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
    }),
  },
  {
    signature: "CollateralWithdrawnEvent(uint64,address,uint64,uint64,uint64)",
    type: "collateral_withdrawn",
    args: ["uint64", "address", "uint64", "uint64", "uint64"],
    map: ([vaultId, owner, amountMicroAlgo], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "collateral_withdrawn",
      vaultId: vaultId as bigint,
      owner: owner as string,
      amountMicroAlgo: amountMicroAlgo as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
    }),
  },
  {
    signature: "VaultClosedEvent(uint64,address,uint64,uint64)",
    type: "vault_closed",
    args: ["uint64", "address", "uint64", "uint64"],
    map: ([vaultId, owner, amountMicroAlgo], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "vault_closed",
      vaultId: vaultId as bigint,
      owner: owner as string,
      amountMicroAlgo: amountMicroAlgo as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
    }),
  },
  {
    signature: "VaultLiquidatedEvent(uint64,address,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64)",
    type: "liquidation",
    args: ["uint64", "address", "address", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64"],
    map: ([vaultId, owner, liquidator, repaidDebtMicroStable, liquidatorCollateralMicroAlgo], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "liquidation",
      vaultId: vaultId as bigint,
      owner: owner as string,
      actor: liquidator as string,
      amountMicroStable: repaidDebtMicroStable as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
      metadata: { liquidatorCollateralMicroAlgo: liquidatorCollateralMicroAlgo as bigint },
    }),
  },
  {
    signature: "OracleUpdatedEvent(address,uint64,uint64,uint64)",
    type: "oracle_update",
    args: ["address", "uint64", "uint64", "uint64"],
    map: ([updater, pricePerAlgoMicroUsd, updatedAt, updatedRound], context) => ({
      id: `${context.txId}:${context.logIndex}`,
      type: "oracle_update",
      actor: updater as string,
      amountMicroStable: pricePerAlgoMicroUsd as bigint,
      timestamp: context.timestamp,
      round: context.round,
      txId: context.txId,
      metadata: { pricePerAlgoMicroUsd: pricePerAlgoMicroUsd as bigint, updatedAt: updatedAt as bigint, updatedRound: updatedRound as bigint },
    }),
  },
]

const knownBySelector = new Map(knownEvents.map((event) => [selector(event.signature), event]))

export function decodeKnownEventLog(log: string | Uint8Array, context: EventContext): IndexedEvent | null {
  const bytes = typeof log === "string" ? Buffer.from(log, "base64") : Buffer.from(log)
  if (bytes.length < 4) return null
  const event = knownBySelector.get(bytes.subarray(0, 4).toString("hex"))
  if (!event) return null
  const values: Array<string | bigint> = []
  let offset = 4
  for (const arg of event.args) {
    if (arg === "uint64") {
      if (offset + 8 > bytes.length) return null
      values.push(bytes.readBigUInt64BE(offset))
      offset += 8
      continue
    }
    if (offset + 32 > bytes.length) return null
    values.push(algosdk.encodeAddress(bytes.subarray(offset, offset + 32)))
    offset += 32
  }
  return event.map(values, context)
}

export function selector(signature: string) {
  return createHash("sha512-256").update(signature).digest().subarray(0, 4).toString("hex")
}
