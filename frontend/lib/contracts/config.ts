import type { ProtocolConfig, ProtocolNetwork } from "@/lib/protocol/types"

function parseOptionalBigInt(value?: string) {
  if (!value) return undefined
  try {
    return BigInt(value)
  } catch {
    return undefined
  }
}

function networkFromEnv(value?: string): ProtocolNetwork {
  if (value === "testnet" || value === "mainnet" || value === "localnet") return value
  return "localnet"
}

export function getProtocolConfig(): ProtocolConfig {
  const network = networkFromEnv(process.env.NEXT_PUBLIC_ALGORAND_NETWORK)

  return {
    dataMode: process.env.NEXT_PUBLIC_COLLATERALX_DATA_MODE === "chain" ? "chain" : "mock",
    network,
    algodServer: process.env.NEXT_PUBLIC_ALGOD_SERVER ?? "http://localhost:4001",
    algodToken:
      process.env.NEXT_PUBLIC_ALGOD_TOKEN ??
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    algodPort: process.env.NEXT_PUBLIC_ALGOD_PORT,
    indexerServer: process.env.NEXT_PUBLIC_INDEXER_SERVER ?? "http://localhost:8980",
    indexerToken:
      process.env.NEXT_PUBLIC_INDEXER_TOKEN ??
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    indexerPort: process.env.NEXT_PUBLIC_INDEXER_PORT,
    protocolAppId: parseOptionalBigInt(process.env.NEXT_PUBLIC_PROTOCOL_APP_ID),
    oracleAppId: parseOptionalBigInt(process.env.NEXT_PUBLIC_ORACLE_APP_ID),
    stablecoinAppId: parseOptionalBigInt(process.env.NEXT_PUBLIC_STABLECOIN_APP_ID),
    liquidationAppId: parseOptionalBigInt(process.env.NEXT_PUBLIC_LIQUIDATION_APP_ID),
    keeperAddress: process.env.NEXT_PUBLIC_KEEPER_ADDRESS,
  }
}

export function hasRequiredChainConfig(config: ProtocolConfig) {
  return Boolean(config.protocolAppId && config.oracleAppId && config.stablecoinAppId)
}
