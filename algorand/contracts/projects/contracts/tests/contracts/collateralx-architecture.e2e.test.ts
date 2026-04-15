import { Config } from "@algorandfoundation/algokit-utils"
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing"
import algosdk, { type Address } from "algosdk"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import {
  CollateralXLiquidationExecutorClient,
  CollateralXLiquidationExecutorFactory,
} from "../../smart_contracts/artifacts/collateralx_liquidation/CollateralXLiquidationExecutorClient"
import {
  CollateralXOracleAdapterClient,
  CollateralXOracleAdapterFactory,
} from "../../smart_contracts/artifacts/collateralx_oracle/CollateralXOracleAdapterClient"
import {
  CollateralXProtocolManagerClient,
  CollateralXProtocolManagerFactory,
} from "../../smart_contracts/artifacts/collateralx_protocol/CollateralXProtocolManagerClient"
import {
  CollateralXStablecoinControllerClient,
  CollateralXStablecoinControllerFactory,
} from "../../smart_contracts/artifacts/collateralx_stablecoin/CollateralXStablecoinControllerClient"

const fixture = algorandFixture()
const TEST_TIMEOUT = 120_000
const ZERO_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"
const SOURCE = new TextEncoder().encode("manual:localnet")

const INITIAL_PROTOCOL_ARGS = {
  minCollateralRatioBps: 15_000,
  liquidationRatioBps: 12_500,
  liquidationPenaltyBps: 500,
  liquidationBonusBps: 300,
  oracleFreshnessWindowSeconds: 3_600,
  vaultMintCapMicroStable: 1_000_000_000_000,
  protocolDebtCeilingMicroStable: 10_000_000_000_000,
  minDebtFloorMicroStable: 10_000_000,
  oracleAppId: 11,
  stablecoinAppId: 22,
  liquidationAppId: 33,
}

const CREATE_VAULT_PAUSE_FLAG = 32
const ORACLE_READ_PAUSE_FLAG = 2
const ORACLE_UPDATE_PAUSE_FLAG = 1
const STABLECOIN_MINT_PAUSE_FLAG = 1
const LIQUIDATION_EXECUTE_PAUSE_FLAG = 1

beforeAll(() => {
  Config.configure({ debug: true })
})

beforeEach(fixture.newScope, TEST_TIMEOUT)

function addressString(account: { addr: Address }) {
  return account.addr.toString()
}

async function freshOracleClock(ageSeconds = 1) {
  const status = (await fixture.context.algod.status().do()) as unknown as Record<string, number | bigint | undefined>
  const lastRound = Number(status.lastRound ?? status["last-round"])
  const block = (await fixture.context.algod.block(lastRound).do()) as unknown as {
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
    updatedAt: timestamp > ageSeconds ? timestamp - ageSeconds : timestamp,
    updatedRound: BigInt(lastRound),
  }
}

function uint64Bytes(value: bigint) {
  return new algosdk.ABIUintType(64).encode(value)
}

function boxName(prefix: string, suffix: Uint8Array) {
  const prefixBytes = new TextEncoder().encode(prefix)
  return new Uint8Array([...prefixBytes, ...suffix])
}

function vaultBox(appId: bigint, vaultId: bigint) {
  return {
    appId,
    name: boxName("v", uint64Bytes(vaultId)),
  }
}

function ownerVaultBox(appId: bigint, owner: string, vaultId: bigint) {
  const ownerBytes = algosdk.decodeAddress(owner).publicKey
  const key = new Uint8Array([...ownerBytes, ...uint64Bytes(vaultId)])
  return {
    appId,
    name: boxName("o", key),
  }
}

function vaultCreationBoxes(appId: bigint, owner: string, vaultId: bigint) {
  return [vaultBox(appId, vaultId), ownerVaultBox(appId, owner, vaultId)]
}

async function deployProtocol(admin: { addr: Address }) {
  const factory = fixture.algorand.client.getTypedAppFactory(CollateralXProtocolManagerFactory, {
    defaultSender: admin.addr,
  })
  const { appClient } = await factory.deploy({
    onUpdate: "append",
    onSchemaBreak: "append",
    createParams: {
      method: "createApplication",
      args: { admin: addressString(admin) },
    },
  })
  await fixture.algorand.send.payment({
    amount: (5).algo(),
    sender: admin.addr,
    receiver: appClient.appAddress,
  })
  return appClient
}

async function deployOracle(admin: { addr: Address }) {
  const factory = fixture.algorand.client.getTypedAppFactory(CollateralXOracleAdapterFactory, {
    defaultSender: admin.addr,
  })
  const { appClient } = await factory.deploy({
    onUpdate: "append",
    onSchemaBreak: "append",
    createParams: {
      method: "createApplication",
      args: { admin: addressString(admin) },
    },
  })
  return appClient
}

async function deployStablecoin(admin: { addr: Address }) {
  const factory = fixture.algorand.client.getTypedAppFactory(CollateralXStablecoinControllerFactory, {
    defaultSender: admin.addr,
  })
  const { appClient } = await factory.deploy({
    onUpdate: "append",
    onSchemaBreak: "append",
    createParams: {
      method: "createApplication",
      args: { admin: addressString(admin) },
    },
  })
  return appClient
}

async function deployLiquidation(admin: { addr: Address }) {
  const factory = fixture.algorand.client.getTypedAppFactory(CollateralXLiquidationExecutorFactory, {
    defaultSender: admin.addr,
  })
  const { appClient } = await factory.deploy({
    onUpdate: "append",
    onSchemaBreak: "append",
    createParams: {
      method: "createApplication",
      args: { admin: addressString(admin) },
    },
  })
  return appClient
}

async function initializeProtocol(client: CollateralXProtocolManagerClient) {
  await client.send.initializeProtocol({ args: INITIAL_PROTOCOL_ARGS })
}

async function initializeOracle(client: CollateralXOracleAdapterClient) {
  const clock = await freshOracleClock()
  await client.send.initializeOracle({
    args: {
      pricePerAlgoMicroUsd: 250_000,
      updatedAt: clock.updatedAt,
      updatedRound: clock.updatedRound,
      maxAgeSeconds: 3_600,
      source: SOURCE,
    },
  })
}

async function initializeStablecoin(client: CollateralXStablecoinControllerClient) {
  await client.send.initializeStablecoinController({
    args: {
      protocolManagerAppId: 101,
      stableAssetId: 202,
      supplyCeilingMicroStable: 10_000_000_000_000,
    },
  })
}

async function initializeLiquidation(client: CollateralXLiquidationExecutorClient, keeper: string) {
  await client.send.initializeLiquidationExecutor({
    args: {
      protocolManagerAppId: 101,
      keeper,
    },
  })
}

describe("CollateralX creation guards", () => {
  it("rejects zero address bootstrap admins for every module", async () => {
    const { testAccount } = fixture.context

    const protocolFactory = fixture.algorand.client.getTypedAppFactory(CollateralXProtocolManagerFactory, {
      defaultSender: testAccount.addr,
    })
    await expect(
      protocolFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: ZERO_ADDRESS },
        },
      })
    ).rejects.toThrow()

    const oracleFactory = fixture.algorand.client.getTypedAppFactory(CollateralXOracleAdapterFactory, {
      defaultSender: testAccount.addr,
    })
    await expect(
      oracleFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: ZERO_ADDRESS },
        },
      })
    ).rejects.toThrow()

    const stablecoinFactory = fixture.algorand.client.getTypedAppFactory(CollateralXStablecoinControllerFactory, {
      defaultSender: testAccount.addr,
    })
    await expect(
      stablecoinFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: ZERO_ADDRESS },
        },
      })
    ).rejects.toThrow()

    const liquidationFactory = fixture.algorand.client.getTypedAppFactory(CollateralXLiquidationExecutorFactory, {
      defaultSender: testAccount.addr,
    })
    await expect(
      liquidationFactory.deploy({
        onUpdate: "append",
        onSchemaBreak: "append",
        createParams: {
          method: "createApplication",
          args: { admin: ZERO_ADDRESS },
        },
      })
    ).rejects.toThrow()
  }, TEST_TIMEOUT)
})

describe("CollateralX protocol manager", () => {
  it("initializes protocol state and creates deterministic box-backed vaults", async () => {
    const { testAccount } = fixture.context
    const admin = addressString(testAccount)
    const client = await deployProtocol(testAccount)

    let status = await client.readProtocolStatus()
    expect(status.admin).toBe(admin)
    expect(status.initialized).toBe(0n)
    expect(status.nextVaultId).toBe(1n)
    expect(status.vaultCount).toBe(0n)

    await initializeProtocol(client)

    status = await client.readProtocolStatus()
    expect(status.initialized).toBe(1n)
    expect(status.nextVaultId).toBe(1n)
    expect(status.vaultCount).toBe(0n)
    expect(status.oracleAppId).toBe(11n)
    expect(status.stablecoinAppId).toBe(22n)
    expect(status.liquidationAppId).toBe(33n)

    const params = await client.readProtocolParams()
    expect(params.minCollateralRatioBps).toBe(15_000n)
    expect(params.protocolDebtCeilingMicroStable).toBe(10_000_000_000_000n)

    const firstVault = await client.send.createVault({
      args: [],
      boxReferences: vaultCreationBoxes(client.appId, admin, 1n),
    })
    expect(firstVault.return).toBe(1n)

    const vault = await client.readVault({
      args: { vaultId: 1 },
      boxReferences: [vaultBox(client.appId, 1n)],
    })
    expect(vault.id).toBe(1n)
    expect(vault.owner).toBe(admin)
    expect(vault.collateralMicroAlgo).toBe(0n)
    expect(vault.debtMicroStable).toBe(0n)
    expect(vault.status).toBe(1n)
    expect(vault.version).toBe(1n)
    expect(vault.updatedAt).toBe(vault.createdAt)

    await expect(
      client.vaultExists({
        args: { vaultId: 1 },
        boxReferences: [vaultBox(client.appId, 1n)],
      })
    ).resolves.toBe(true)
    await expect(
      client.vaultExists({
        args: { vaultId: 99 },
        boxReferences: [vaultBox(client.appId, 99n)],
      })
    ).resolves.toBe(false)

    const secondVault = await client.send.createVault({
      args: [],
      boxReferences: vaultCreationBoxes(client.appId, admin, 2n),
    })
    expect(secondVault.return).toBe(2n)

    status = await client.readProtocolStatus()
    expect(status.nextVaultId).toBe(3n)
    expect(status.vaultCount).toBe(2n)
  }, TEST_TIMEOUT)

  it("rejects protocol error paths and admin-only calls", async () => {
    const { testAccount } = fixture.context
    const other = await fixture.context.generateAccount({ initialFunds: (10).algo(), suppressLog: true })
    const admin = addressString(testAccount)
    const otherAddress = addressString(other)
    const client = await deployProtocol(testAccount)

    await expect(
      client.send.createVault({
        args: [],
        boxReferences: vaultCreationBoxes(client.appId, admin, 1n),
      })
    ).rejects.toThrow()

    await expect(
      client.send.initializeProtocol({
        sender: other.addr,
        args: INITIAL_PROTOCOL_ARGS,
      })
    ).rejects.toThrow()

    await expect(
      client.send.initializeProtocol({
        args: {
          ...INITIAL_PROTOCOL_ARGS,
          minCollateralRatioBps: 9_999,
        },
      })
    ).rejects.toThrow()

    await initializeProtocol(client)

    await expect(client.send.initializeProtocol({ args: INITIAL_PROTOCOL_ARGS })).rejects.toThrow()

    await expect(
      client.send.adminSetParams({
        sender: other.addr,
        args: {
          minCollateralRatioBps: 16_000,
          liquidationRatioBps: 13_000,
          liquidationPenaltyBps: 600,
          liquidationBonusBps: 350,
          oracleFreshnessWindowSeconds: 4_000,
          vaultMintCapMicroStable: 1_000_000,
          protocolDebtCeilingMicroStable: 2_000_000,
          minDebtFloorMicroStable: 100_000,
        },
      })
    ).rejects.toThrow()

    await expect(
      client.send.adminSetParams({
        args: {
          minCollateralRatioBps: 16_000,
          liquidationRatioBps: 17_000,
          liquidationPenaltyBps: 600,
          liquidationBonusBps: 350,
          oracleFreshnessWindowSeconds: 4_000,
          vaultMintCapMicroStable: 1_000_000,
          protocolDebtCeilingMicroStable: 2_000_000,
          minDebtFloorMicroStable: 100_000,
        },
      })
    ).rejects.toThrow()

    await client.send.adminSetParams({
      args: {
        minCollateralRatioBps: 16_000,
        liquidationRatioBps: 13_000,
        liquidationPenaltyBps: 600,
        liquidationBonusBps: 350,
        oracleFreshnessWindowSeconds: 4_000,
        vaultMintCapMicroStable: 2_000_000,
        protocolDebtCeilingMicroStable: 20_000_000,
        minDebtFloorMicroStable: 100_000,
      },
    })
    let params = await client.readProtocolParams()
    expect(params.minCollateralRatioBps).toBe(16_000n)
    expect(params.oracleFreshnessWindowSeconds).toBe(4_000n)

    await client.send.adminSetIntegrations({
      args: {
        oracleAppId: 44,
        stablecoinAppId: 55,
        liquidationAppId: 66,
      },
    })
    let status = await client.readProtocolStatus()
    expect(status.oracleAppId).toBe(44n)
    expect(status.stablecoinAppId).toBe(55n)
    expect(status.liquidationAppId).toBe(66n)

    await expect(
      client.send.adminSetPauseFlags({
        sender: other.addr,
        args: { pauseFlags: CREATE_VAULT_PAUSE_FLAG },
      })
    ).rejects.toThrow()

    await client.send.adminSetPauseFlags({ args: { pauseFlags: CREATE_VAULT_PAUSE_FLAG } })
    status = await client.readProtocolStatus()
    expect(status.pauseFlags).toBe(BigInt(CREATE_VAULT_PAUSE_FLAG))
    await expect(
      client.send.createVault({
        args: [],
        boxReferences: vaultCreationBoxes(client.appId, admin, 1n),
      })
    ).rejects.toThrow()

    await client.send.adminSetPauseFlags({ args: { pauseFlags: 0 } })
    await expect(client.send.adminTransfer({ args: { newAdmin: ZERO_ADDRESS } })).rejects.toThrow()

    await client.send.adminTransfer({ args: { newAdmin: otherAddress } })
    status = await client.readProtocolStatus()
    expect(status.admin).toBe(otherAddress)

    await expect(client.send.adminSetPauseFlags({ args: { pauseFlags: 1 } })).rejects.toThrow()
    await client.send.adminSetPauseFlags({
      sender: other.addr,
      args: { pauseFlags: 1 },
    })
    status = await client.readProtocolStatus()
    expect(status.pauseFlags).toBe(1n)

    params = await client.readProtocolParams()
    expect(params.minCollateralRatioBps).toBe(16_000n)
  }, TEST_TIMEOUT)
})

describe("CollateralX oracle adapter", () => {
  it("initializes, updates price samples, pauses reads and rejects invalid callers", async () => {
    const { testAccount } = fixture.context
    const other = await fixture.context.generateAccount({ initialFunds: (10).algo(), suppressLog: true })
    const client = await deployOracle(testAccount)
    const clock = await freshOracleClock()

    await expect(client.readOraclePrice()).rejects.toThrow()
    await expect(
      client.send.initializeOracle({
        sender: other.addr,
        args: {
          pricePerAlgoMicroUsd: 250_000,
          updatedAt: clock.updatedAt,
          updatedRound: clock.updatedRound,
          maxAgeSeconds: 3_600,
          source: SOURCE,
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.initializeOracle({
        args: {
          pricePerAlgoMicroUsd: 0,
          updatedAt: clock.updatedAt,
          updatedRound: clock.updatedRound,
          maxAgeSeconds: 3_600,
          source: SOURCE,
        },
      })
    ).rejects.toThrow()

    await initializeOracle(client)

    let sample = await client.readOraclePrice()
    expect(sample.pricePerAlgoMicroUsd).toBe(250_000n)
    expect(sample.updatedRound).toBeGreaterThan(0n)
    expect(Buffer.from(sample.source).toString("utf8")).toBe("manual:localnet")
    expect(sample.maxAgeSeconds).toBe(3_600n)
    expect(sample.updater).toBe(addressString(testAccount))
    expect(sample.isFresh).toBe(true)
    await expect(client.readFreshOraclePrice()).resolves.toMatchObject({ pricePerAlgoMicroUsd: 250_000n })

    await expect(client.send.initializeOracle({
      args: {
        pricePerAlgoMicroUsd: 250_000,
        updatedAt: clock.updatedAt,
        updatedRound: clock.updatedRound,
        maxAgeSeconds: 3_600,
        source: SOURCE,
      },
    })).rejects.toThrow()

    const updateClock = await freshOracleClock()
    await expect(
      client.send.updatePrice({
        sender: other.addr,
        args: {
          pricePerAlgoMicroUsd: 260_000,
          updatedAt: updateClock.updatedAt,
          updatedRound: updateClock.updatedRound,
          source: SOURCE,
        },
      })
    ).rejects.toThrow()

    await client.send.updatePrice({
      args: {
        pricePerAlgoMicroUsd: 260_000,
        updatedAt: updateClock.updatedAt,
        updatedRound: updateClock.updatedRound,
        source: new TextEncoder().encode("manual:update"),
      },
    })
    sample = await client.readOraclePrice()
    expect(sample.pricePerAlgoMicroUsd).toBe(260_000n)
    expect(Buffer.from(sample.source).toString("utf8")).toBe("manual:update")

    await expect(client.send.adminSetUpdater({ args: { newUpdater: ZERO_ADDRESS } })).rejects.toThrow()
    await client.send.adminSetUpdater({ args: { newUpdater: addressString(other) } })
    sample = await client.readOraclePrice()
    expect(sample.updater).toBe(addressString(other))

    const rotatedClock = await freshOracleClock()
    await client.send.updatePrice({
      sender: other.addr,
      args: {
        pricePerAlgoMicroUsd: 265_000,
        updatedAt: rotatedClock.updatedAt,
        updatedRound: rotatedClock.updatedRound,
        source: new TextEncoder().encode("manual:rotated"),
      },
    })
    sample = await client.readOraclePrice()
    expect(sample.pricePerAlgoMicroUsd).toBe(265_000n)

    await expect(client.send.adminSetOracleConfig({ args: { maxAgeSeconds: 0 } })).rejects.toThrow()
    await client.send.adminSetOracleConfig({ args: { maxAgeSeconds: 7_200 } })
    sample = await client.readOraclePrice()
    expect(sample.maxAgeSeconds).toBe(7_200n)

    await client.send.adminSetPauseFlags({ args: { pauseFlags: ORACLE_UPDATE_PAUSE_FLAG } })
    const pausedClock = await freshOracleClock()
    await expect(
      client.send.updatePrice({
        sender: other.addr,
        args: {
          pricePerAlgoMicroUsd: 270_000,
          updatedAt: pausedClock.updatedAt,
          updatedRound: pausedClock.updatedRound,
          source: SOURCE,
        },
      })
    ).rejects.toThrow()

    await client.send.adminSetPauseFlags({ args: { pauseFlags: ORACLE_READ_PAUSE_FLAG } })
    await expect(client.readOraclePrice()).rejects.toThrow()

    await client.send.adminSetPauseFlags({ args: { pauseFlags: 0 } })
  }, TEST_TIMEOUT)

  it("validates freshness, timestamp, and round boundaries", async () => {
    const { testAccount } = fixture.context
    const client = await deployOracle(testAccount)
    const clock = await freshOracleClock()

    await expect(
      client.send.initializeOracle({
        args: {
          pricePerAlgoMicroUsd: 250_000,
          updatedAt: clock.updatedAt + 10_000,
          updatedRound: clock.updatedRound,
          maxAgeSeconds: 3_600,
          source: SOURCE,
        },
      })
    ).rejects.toThrow(/timestamp future/)

    await expect(
      client.send.initializeOracle({
        args: {
          pricePerAlgoMicroUsd: 250_000,
          updatedAt: clock.updatedAt,
          updatedRound: clock.updatedRound + 1_000_000n,
          maxAgeSeconds: 3_600,
          source: SOURCE,
        },
      })
    ).rejects.toThrow(/round future/)

    await expect(
      client.send.initializeOracle({
        args: {
          pricePerAlgoMicroUsd: 250_000,
          updatedAt: clock.updatedAt - 10,
          updatedRound: clock.updatedRound,
          maxAgeSeconds: 1,
          source: SOURCE,
        },
      })
    ).rejects.toThrow(/price stale/)

    const staleableClock = await freshOracleClock(10)
    await client.send.initializeOracle({
      args: {
        pricePerAlgoMicroUsd: 250_000,
        updatedAt: staleableClock.updatedAt,
        updatedRound: staleableClock.updatedRound,
        maxAgeSeconds: 3_600,
        source: SOURCE,
      },
    })
    let sample = await client.readOraclePrice()

    await expect(
      client.send.updatePrice({
        args: {
          pricePerAlgoMicroUsd: 260_000,
          updatedAt: Number(sample.updatedAt),
          updatedRound: sample.updatedRound,
          source: SOURCE,
        },
      })
    ).rejects.toThrow(/round not newer/)

    await client.send.adminSetOracleConfig({ args: { maxAgeSeconds: 1 } })
    sample = await client.readOraclePrice()
    expect(sample.isFresh).toBe(false)
    await expect(client.readFreshOraclePrice()).rejects.toThrow(/oracle stale/)
  }, TEST_TIMEOUT)
})

describe("CollateralX stablecoin controller", () => {
  it("initializes, updates config, pauses minting and rejects invalid callers", async () => {
    const { testAccount } = fixture.context
    const other = await fixture.context.generateAccount({ initialFunds: (10).algo(), suppressLog: true })
    const client = await deployStablecoin(testAccount)

    let state = await client.readStablecoinControlState()
    expect(state.admin).toBe(addressString(testAccount))
    expect(state.initialized).toBe(0n)

    await expect(
      client.send.initializeStablecoinController({
        sender: other.addr,
        args: {
          protocolManagerAppId: 101,
          stableAssetId: 202,
          supplyCeilingMicroStable: 10_000_000,
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.initializeStablecoinController({
        args: {
          protocolManagerAppId: 0,
          stableAssetId: 202,
          supplyCeilingMicroStable: 10_000_000,
        },
      })
    ).rejects.toThrow()

    await initializeStablecoin(client)

    state = await client.readStablecoinControlState()
    expect(state.initialized).toBe(1n)
    expect(state.protocolManagerAppId).toBe(101n)
    expect(state.stableAssetId).toBe(202n)
    expect(state.supplyCeilingMicroStable).toBe(10_000_000_000_000n)

    await expect(
      client.send.initializeStablecoinController({
        args: {
          protocolManagerAppId: 101,
          stableAssetId: 202,
          supplyCeilingMicroStable: 10_000_000_000_000,
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.adminSetStablecoinConfig({
        sender: other.addr,
        args: {
          protocolManagerAppId: 303,
          stableAssetId: 404,
          supplyCeilingMicroStable: 20_000_000_000_000,
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.adminSetStablecoinConfig({
        args: {
          protocolManagerAppId: 0,
          stableAssetId: 404,
          supplyCeilingMicroStable: 20_000_000_000_000,
        },
      })
    ).rejects.toThrow()

    await client.send.adminSetStablecoinConfig({
      args: {
        protocolManagerAppId: 303,
        stableAssetId: 404,
        supplyCeilingMicroStable: 20_000_000_000_000,
      },
    })
    state = await client.readStablecoinControlState()
    expect(state.protocolManagerAppId).toBe(303n)
    expect(state.stableAssetId).toBe(404n)
    expect(state.supplyCeilingMicroStable).toBe(20_000_000_000_000n)

    await expect(
      client.send.adminSetPauseFlags({
        sender: other.addr,
        args: { pauseFlags: STABLECOIN_MINT_PAUSE_FLAG },
      })
    ).rejects.toThrow()
    await client.send.adminSetPauseFlags({ args: { pauseFlags: STABLECOIN_MINT_PAUSE_FLAG } })
    state = await client.readStablecoinControlState()
    expect(state.pauseFlags).toBe(BigInt(STABLECOIN_MINT_PAUSE_FLAG))

    await expect(
      client.send.mintForVault({
        args: {
          vaultId: 1,
          receiver: addressString(testAccount),
          amountMicroStable: 1_000_000,
        },
      })
    ).rejects.toThrow()
  }, TEST_TIMEOUT)
})

describe("CollateralX liquidation executor", () => {
  it("initializes, updates keeper policy, pauses execution and rejects invalid callers", async () => {
    const { testAccount } = fixture.context
    const other = await fixture.context.generateAccount({ initialFunds: (10).algo(), suppressLog: true })
    const client = await deployLiquidation(testAccount)

    await expect(
      client.send.initializeLiquidationExecutor({
        sender: other.addr,
        args: {
          protocolManagerAppId: 101,
          keeper: ZERO_ADDRESS,
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.initializeLiquidationExecutor({
        args: {
          protocolManagerAppId: 0,
          keeper: ZERO_ADDRESS,
        },
      })
    ).rejects.toThrow()

    await initializeLiquidation(client, ZERO_ADDRESS)

    let state = await client.readLiquidationExecutorState()
    expect(state.admin).toBe(addressString(testAccount))
    expect(state.initialized).toBe(1n)
    expect(state.protocolManagerAppId).toBe(101n)
    expect(state.keeper).toBe(ZERO_ADDRESS)

    await expect(
      client.send.initializeLiquidationExecutor({
        args: {
          protocolManagerAppId: 101,
          keeper: ZERO_ADDRESS,
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.adminSetLiquidationConfig({
        sender: other.addr,
        args: {
          protocolManagerAppId: 202,
          keeper: addressString(other),
        },
      })
    ).rejects.toThrow()
    await expect(
      client.send.adminSetLiquidationConfig({
        args: {
          protocolManagerAppId: 0,
          keeper: addressString(other),
        },
      })
    ).rejects.toThrow()

    await client.send.adminSetLiquidationConfig({
      args: {
        protocolManagerAppId: 202,
        keeper: addressString(other),
      },
    })
    state = await client.readLiquidationExecutorState()
    expect(state.protocolManagerAppId).toBe(202n)
    expect(state.keeper).toBe(addressString(other))

    await expect(
      client.send.adminSetPauseFlags({
        sender: other.addr,
        args: { pauseFlags: LIQUIDATION_EXECUTE_PAUSE_FLAG },
      })
    ).rejects.toThrow()
    await client.send.adminSetPauseFlags({ args: { pauseFlags: LIQUIDATION_EXECUTE_PAUSE_FLAG } })
    state = await client.readLiquidationExecutorState()
    expect(state.pauseFlags).toBe(BigInt(LIQUIDATION_EXECUTE_PAUSE_FLAG))
  }, TEST_TIMEOUT)
})
