import { Config, AlgorandClient, algo, microAlgo } from "@algorandfoundation/algokit-utils"
import algosdk from "algosdk"
import {
  CollateralXLiquidationExecutorFactory,
} from "../smart_contracts/artifacts/collateralx_liquidation/CollateralXLiquidationExecutorClient"
import {
  CollateralXOracleAdapterFactory,
} from "../smart_contracts/artifacts/collateralx_oracle/CollateralXOracleAdapterClient"
import {
  CollateralXProtocolManagerFactory,
} from "../smart_contracts/artifacts/collateralx_protocol/CollateralXProtocolManagerClient"
import {
  CollateralXStablecoinControllerFactory,
} from "../smart_contracts/artifacts/collateralx_stablecoin/CollateralXStablecoinControllerClient"

const SOURCE = new TextEncoder().encode("manual:localnet")
const RESERVE_SUPPLY = 10_000_000_000_000n

type SigningAccountWithSecret = Awaited<ReturnType<AlgorandClient["account"]["fromEnvironment"]>>

type BootstrapSummary = {
  network: "localnet"
  deployer: {
    address: string
    mnemonic: string
  }
  keeper: {
    address: string
    mnemonic: string
  }
  oracleUpdater: {
    address: string
    mnemonic: string
  }
  protocol: {
    appId: bigint
    appAddress: string
  }
  oracle: {
    appId: bigint
    appAddress: string
  }
  stablecoin: {
    appId: bigint
    appAddress: string
    assetId: bigint
  }
  liquidation: {
    appId: bigint
    appAddress: string
  }
}

function addressString(account: { addr: { toString(): string } }) {
  return account.addr.toString()
}

function appAddressString(appAddress: { toString(): string } | string) {
  return appAddress.toString()
}

function mnemonicFrom(account: SigningAccountWithSecret) {
  return algosdk.secretKeyToMnemonic(account.account.sk)
}

async function freshOracleClock(algorand: AlgorandClient) {
  const status = (await algorand.client.algod.status().do()) as unknown as Record<string, number | bigint | undefined>
  const lastRound = Number(status.lastRound ?? status["last-round"])
  const block = (await algorand.client.algod.block(lastRound).do()) as unknown as {
    block?: {
      ts?: number | bigint
      timestamp?: number | bigint
      header?: { ts?: number | bigint; timestamp?: number | bigint }
    }
  }

  const timestampValue =
    block.block?.ts ?? block.block?.timestamp ?? block.block?.header?.ts ?? block.block?.header?.timestamp
  const timestamp = timestampValue === undefined ? undefined : Number(timestampValue)
  if (timestamp === undefined || !Number.isFinite(timestamp)) {
    throw new Error("latest LocalNet block timestamp unavailable")
  }

  return {
    updatedAt: timestamp > 1 ? timestamp - 1 : timestamp,
    updatedRound: BigInt(lastRound),
  }
}

async function main() {
  Config.configure({ debug: false })

  const algorand = AlgorandClient.defaultLocalNet()

  const deployer = await algorand.account.fromEnvironment("DEPLOYER", algo(1_000))
  const keeper = await algorand.account.fromEnvironment("KEEPER", algo(250))
  const oracleUpdater = await algorand.account.fromEnvironment("ORACLE_UPDATER", algo(250))

  const protocolFactory = algorand.client.getTypedAppFactory(CollateralXProtocolManagerFactory, {
    defaultSender: deployer.addr,
  })
  const oracleFactory = algorand.client.getTypedAppFactory(CollateralXOracleAdapterFactory, {
    defaultSender: deployer.addr,
  })
  const stablecoinFactory = algorand.client.getTypedAppFactory(CollateralXStablecoinControllerFactory, {
    defaultSender: deployer.addr,
  })
  const liquidationFactory = algorand.client.getTypedAppFactory(CollateralXLiquidationExecutorFactory, {
    defaultSender: deployer.addr,
  })

  const [{ appClient: protocol }, { appClient: oracle }, { appClient: stablecoin }, { appClient: liquidation }] =
    await Promise.all([
      protocolFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: addressString(deployer) },
        },
      }),
      oracleFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: addressString(deployer) },
        },
      }),
      stablecoinFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: addressString(deployer) },
        },
      }),
      liquidationFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: addressString(deployer) },
        },
      }),
    ])

  await algorand.account.ensureFunded(protocol.appAddress, deployer.addr, algo(10))
  await algorand.account.ensureFunded(stablecoin.appAddress, deployer.addr, algo(2))

  const oracleInitialized = (await oracle.state.global.initialized()) === 1n
  const stablecoinInitialized = (await stablecoin.state.global.initialized()) === 1n
  const liquidationInitialized = (await liquidation.state.global.initialized()) === 1n
  const protocolInitialized = (await protocol.state.global.initialized()) === 1n

  let stableAssetId = await stablecoin.state.global.stableAssetId()
  if (!stableAssetId) {
    const createdAsset = await algorand.send.assetCreate({
      sender: deployer.addr,
      total: RESERVE_SUPPLY,
      decimals: 6,
      assetName: "CollateralX Dollar",
      unitName: "cxUSD",
    })
    stableAssetId = createdAsset.assetId
  }

  if (!oracleInitialized) {
    const oracleClock = await freshOracleClock(algorand)
    await oracle.send.initializeOracle({
      args: {
        pricePerAlgoMicroUsd: 381_200,
        updatedAt: oracleClock.updatedAt,
        updatedRound: oracleClock.updatedRound,
        maxAgeSeconds: 3_600,
        source: SOURCE,
      },
    })
  }

  if ((await oracle.state.global.updater()) !== addressString(oracleUpdater)) {
    await oracle.send.adminSetUpdater({
      args: { newUpdater: addressString(oracleUpdater) },
    })
  }

  if (!stablecoinInitialized) {
    await stablecoin.send.initializeStablecoinController({
      args: {
        protocolManagerAppId: protocol.appId,
        stableAssetId,
        supplyCeilingMicroStable: RESERVE_SUPPLY,
      },
    })
    await stablecoin.send.optInToStableAsset({
      args: [],
      assetReferences: [stableAssetId],
      extraFee: microAlgo(1_000),
    })
    await algorand.send.assetTransfer({
      sender: deployer.addr,
      receiver: stablecoin.appAddress,
      assetId: stableAssetId,
      amount: RESERVE_SUPPLY,
    })
  }

  if (!liquidationInitialized) {
    await liquidation.send.initializeLiquidationExecutor({
      args: {
        protocolManagerAppId: protocol.appId,
        keeper: addressString(keeper),
      },
    })
  }

  if (!protocolInitialized) {
    await protocol.send.initializeProtocol({
      args: {
        minCollateralRatioBps: 15_000,
        liquidationRatioBps: 12_500,
        liquidationPenaltyBps: 500,
        liquidationBonusBps: 300,
        oracleFreshnessWindowSeconds: 3_600,
        vaultMintCapMicroStable: 1_000_000_000_000n,
        protocolDebtCeilingMicroStable: 10_000_000_000_000n,
        minDebtFloorMicroStable: 10_000_000n,
        oracleAppId: oracle.appId,
        stablecoinAppId: stablecoin.appId,
        liquidationAppId: liquidation.appId,
      },
    })
  }

  const summary: BootstrapSummary = {
    network: "localnet",
    deployer: {
      address: addressString(deployer),
      mnemonic: mnemonicFrom(deployer),
    },
    keeper: {
      address: addressString(keeper),
      mnemonic: mnemonicFrom(keeper),
    },
    oracleUpdater: {
      address: addressString(oracleUpdater),
      mnemonic: mnemonicFrom(oracleUpdater),
    },
    protocol: {
      appId: protocol.appId,
      appAddress: appAddressString(protocol.appAddress),
    },
    oracle: {
      appId: oracle.appId,
      appAddress: appAddressString(oracle.appAddress),
    },
    stablecoin: {
      appId: stablecoin.appId,
      appAddress: appAddressString(stablecoin.appAddress),
      assetId: stableAssetId,
    },
    liquidation: {
      appId: liquidation.appId,
      appAddress: appAddressString(liquidation.appAddress),
    },
  }

  console.log(
    JSON.stringify(summary, (_, value) => (typeof value === "bigint" ? value.toString() : value), 2)
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
