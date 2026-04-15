import { Config, algo, microAlgo } from "@algorandfoundation/algokit-utils"
import { algorandFixture } from "@algorandfoundation/algokit-utils/testing"
import algosdk, { type Address } from "algosdk"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
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

const fixture = algorandFixture({ testAccountFunding: algo(100) })
const TEST_TIMEOUT = 120_000
const SOURCE = new TextEncoder().encode("manual:localnet")
const MICRO_STABLE = 1_000_000n
const MICRO_ALGO = 1_000_000n
const ONE_USD_PER_ALGO = 1_000_000
const RESERVE_SUPPLY = 10_000_000_000_000n
const PAUSE_MINT = 2

type TestAccount = { addr: Address }

type DeployOptions = {
  oracleUpdatedAt?: number
  oraclePricePerAlgoMicroUsd?: number
  protocolDebtCeilingMicroStable?: number | bigint
  vaultMintCapMicroStable?: number | bigint
  supplyCeilingMicroStable?: number | bigint
  minDebtFloorMicroStable?: number | bigint
}

type DeployedSystem = {
  admin: TestAccount
  owner: TestAccount
  other: TestAccount
  oracle: CollateralXOracleAdapterClient
  protocol: CollateralXProtocolManagerClient
  stablecoin: CollateralXStablecoinControllerClient
  stableAssetId: bigint
}

beforeAll(() => {
  Config.configure({ debug: false })
})

beforeEach(fixture.newScope, TEST_TIMEOUT)

function addressString(account: TestAccount) {
  return account.addr.toString()
}

function appAddressString(client: { appAddress: Address | string }) {
  return client.appAddress.toString()
}

async function freshTimestamp() {
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
  return timestamp > 1 ? timestamp - 1 : timestamp
}

function stableAmount(units: bigint) {
  return units * MICRO_STABLE
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

async function deployOracle(admin: TestAccount) {
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

async function deployProtocol(admin: TestAccount) {
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
  return appClient
}

async function deployStablecoin(admin: TestAccount) {
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

async function deploySystem(options: DeployOptions = {}): Promise<DeployedSystem> {
  const admin = fixture.context.testAccount
  const owner = await fixture.context.generateAccount({ initialFunds: algo(500), suppressLog: true })
  const other = await fixture.context.generateAccount({ initialFunds: algo(100), suppressLog: true })
  const oracle = await deployOracle(admin)
  const protocol = await deployProtocol(admin)
  const stablecoin = await deployStablecoin(admin)

  const { assetId: stableAssetId } = await fixture.algorand.send.assetCreate({
    sender: admin.addr,
    total: RESERVE_SUPPLY,
    decimals: 6,
    assetName: "CollateralX Dollar",
    unitName: "cxUSD",
  })

  await fixture.algorand.send.payment({
    amount: algo(10),
    sender: admin.addr,
    receiver: protocol.appAddress,
  })
  await fixture.algorand.send.payment({
    amount: algo(2),
    sender: admin.addr,
    receiver: stablecoin.appAddress,
  })

  await oracle.send.initializeOracle({
    args: {
      pricePerAlgoMicroUsd: options.oraclePricePerAlgoMicroUsd ?? ONE_USD_PER_ALGO,
      updatedAt: options.oracleUpdatedAt ?? (await freshTimestamp()),
      maxAgeSeconds: 3_600,
      source: SOURCE,
    },
  })
  await stablecoin.send.initializeStablecoinController({
    args: {
      protocolManagerAppId: protocol.appId,
      stableAssetId,
      supplyCeilingMicroStable: options.supplyCeilingMicroStable ?? RESERVE_SUPPLY,
    },
  })
  await stablecoin.send.optInToStableAsset({
    args: [],
    assetReferences: [stableAssetId],
    extraFee: microAlgo(1_000),
  })
  await fixture.algorand.send.assetTransfer({
    sender: admin.addr,
    receiver: stablecoin.appAddress,
    assetId: stableAssetId,
    amount: RESERVE_SUPPLY,
  })
  await fixture.algorand.send.assetOptIn({
    sender: owner.addr,
    assetId: stableAssetId,
  })
  await fixture.algorand.send.assetOptIn({
    sender: other.addr,
    assetId: stableAssetId,
  })
  await protocol.send.initializeProtocol({
    args: {
      minCollateralRatioBps: 15_000,
      liquidationRatioBps: 12_500,
      liquidationPenaltyBps: 500,
      liquidationBonusBps: 300,
      oracleFreshnessWindowSeconds: 3_600,
      vaultMintCapMicroStable: options.vaultMintCapMicroStable ?? stableAmount(1_000_000n),
      protocolDebtCeilingMicroStable: options.protocolDebtCeilingMicroStable ?? stableAmount(1_000_000n),
      minDebtFloorMicroStable: options.minDebtFloorMicroStable ?? MICRO_STABLE,
      oracleAppId: oracle.appId,
      stablecoinAppId: stablecoin.appId,
      liquidationAppId: 0,
    },
  })

  return {
    admin,
    owner,
    other,
    oracle,
    protocol,
    stablecoin,
    stableAssetId,
  }
}

async function createVault(system: DeployedSystem, owner = system.owner, vaultId = 1n) {
  await system.protocol.send.createVault({
    sender: owner.addr,
    args: [],
    boxReferences: vaultCreationBoxes(system.protocol.appId, addressString(owner), vaultId),
  })
}

async function depositCollateral(
  system: DeployedSystem,
  vaultId: bigint,
  sender: TestAccount,
  amountMicroAlgo: bigint
) {
  const payment = await fixture.algorand.createTransaction.payment({
    sender: sender.addr,
    receiver: system.protocol.appAddress,
    amount: microAlgo(amountMicroAlgo),
  })
  await system.protocol.send.depositCollateral({
    sender: sender.addr,
    args: {
      vaultId,
      payment,
    },
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
  })
}

async function mintStablecoin(system: DeployedSystem, vaultId: bigint, sender: TestAccount, amountMicroStable: bigint) {
  await system.protocol.send.mintStablecoin({
    sender: sender.addr,
    args: {
      vaultId,
      amountMicroStable,
    },
    appReferences: [system.oracle.appId, system.stablecoin.appId],
    assetReferences: [system.stableAssetId],
    accountReferences: [addressString(sender), appAddressString(system.stablecoin)],
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
    extraFee: microAlgo(2_000),
  })
}

async function readMaxMintable(system: DeployedSystem, vaultId = 1n) {
  return system.protocol.readMaxMintable({
    args: { vaultId },
    appReferences: [system.oracle.appId, system.stablecoin.appId],
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
  })
}

async function stableAssetBalance(address: string, assetId: bigint) {
  const accountInfo = (await fixture.context.algod.accountInformation(address).do()) as {
    assets?: Array<Record<string, unknown>>
  }
  const holding = accountInfo.assets?.find((asset) => {
    const heldAssetId = asset.assetId ?? asset["asset-id"]
    return heldAssetId !== undefined && BigInt(heldAssetId as number | bigint) === assetId
  })
  return BigInt((holding?.amount as number | bigint | undefined) ?? 0)
}

describe("CollateralX deposit and mint workflow", () => {
  it("deposits ALGO collateral and rejects malformed or non-owner deposit groups", async () => {
    const system = await deploySystem()
    await createVault(system)

    const malformedPayment = await fixture.algorand.createTransaction.payment({
      sender: system.owner.addr,
      receiver: system.other.addr,
      amount: algo(1),
    })
    await expect(
      system.protocol.send.depositCollateral({
        sender: system.owner.addr,
        args: {
          vaultId: 1,
          payment: malformedPayment,
        },
        boxReferences: [vaultBox(system.protocol.appId, 1n)],
      })
    ).rejects.toThrow()

    await expect(depositCollateral(system, 1n, system.other, MICRO_ALGO)).rejects.toThrow()

    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)

    const vault = await system.protocol.readVault({
      args: { vaultId: 1 },
      boxReferences: [vaultBox(system.protocol.appId, 1n)],
    })
    expect(vault.owner).toBe(addressString(system.owner))
    expect(vault.collateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(0n)

    const status = await system.protocol.readProtocolStatus()
    expect(status.totalCollateralMicroAlgo).toBe(150n * MICRO_ALGO)
  }, TEST_TIMEOUT)

  it("mints stablecoin at the exact collateral boundary and updates protocol and supply counters", async () => {
    const system = await deploySystem()
    await createVault(system)
    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)

    await expect(readMaxMintable(system)).resolves.toBe(stableAmount(100n))
    await mintStablecoin(system, 1n, system.owner, stableAmount(100n))

    const vault = await system.protocol.readVault({
      args: { vaultId: 1 },
      boxReferences: [vaultBox(system.protocol.appId, 1n)],
    })
    expect(vault.collateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))

    const protocolStatus = await system.protocol.readProtocolStatus()
    expect(protocolStatus.totalDebtMicroStable).toBe(stableAmount(100n))

    const stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(stableAmount(100n))
    await expect(readMaxMintable(system)).resolves.toBe(0n)
    await expect(stableAssetBalance(addressString(system.owner), system.stableAssetId)).resolves.toBe(stableAmount(100n))
  }, TEST_TIMEOUT)

  it("rejects over-minting past the collateral threshold", async () => {
    const system = await deploySystem()
    await createVault(system)
    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)

    await expect(mintStablecoin(system, 1n, system.owner, stableAmount(100n) + 1n)).rejects.toThrow()

    const vault = await system.protocol.readVault({
      args: { vaultId: 1 },
      boxReferences: [vaultBox(system.protocol.appId, 1n)],
    })
    expect(vault.debtMicroStable).toBe(0n)
    const stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(0n)
  }, TEST_TIMEOUT)

  it("rejects stale oracle data", async () => {
    const system = await deploySystem({ oracleUpdatedAt: 1 })
    await createVault(system)
    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)

    await expect(mintStablecoin(system, 1n, system.owner, stableAmount(100n))).rejects.toThrow()
    await expect(readMaxMintable(system)).rejects.toThrow()
  }, TEST_TIMEOUT)

  it("rejects minting while the protocol mint action is paused", async () => {
    const system = await deploySystem()
    await createVault(system)
    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)

    await system.protocol.send.adminSetPauseFlags({ args: { pauseFlags: PAUSE_MINT } })

    await expect(mintStablecoin(system, 1n, system.owner, stableAmount(100n))).rejects.toThrow()
    const vault = await system.protocol.readVault({
      args: { vaultId: 1 },
      boxReferences: [vaultBox(system.protocol.appId, 1n)],
    })
    expect(vault.debtMicroStable).toBe(0n)
  }, TEST_TIMEOUT)

  it("rejects non-owner mint attempts", async () => {
    const system = await deploySystem()
    await createVault(system)
    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)

    await expect(mintStablecoin(system, 1n, system.other, stableAmount(10n))).rejects.toThrow()
    await expect(stableAssetBalance(addressString(system.other), system.stableAssetId)).resolves.toBe(0n)
  }, TEST_TIMEOUT)

  it("handles boundary collateral just below and exactly at the collateral threshold", async () => {
    const system = await deploySystem()
    await createVault(system)

    await depositCollateral(system, 1n, system.owner, 149n * MICRO_ALGO)
    await expect(readMaxMintable(system)).resolves.toBe(99_333_333n)
    await expect(mintStablecoin(system, 1n, system.owner, stableAmount(100n))).rejects.toThrow()

    await depositCollateral(system, 1n, system.owner, MICRO_ALGO)
    await expect(readMaxMintable(system)).resolves.toBe(stableAmount(100n))
    await mintStablecoin(system, 1n, system.owner, stableAmount(100n))
  }, TEST_TIMEOUT)

  it("enforces the aggregate protocol debt ceiling", async () => {
    const system = await deploySystem({
      protocolDebtCeilingMicroStable: stableAmount(150n),
      vaultMintCapMicroStable: stableAmount(100n),
    })
    await createVault(system, system.owner, 1n)
    await createVault(system, system.owner, 2n)
    await depositCollateral(system, 1n, system.owner, 150n * MICRO_ALGO)
    await depositCollateral(system, 2n, system.owner, 150n * MICRO_ALGO)

    await mintStablecoin(system, 1n, system.owner, stableAmount(100n))
    await mintStablecoin(system, 2n, system.owner, stableAmount(50n))
    await expect(mintStablecoin(system, 2n, system.owner, 1n)).rejects.toThrow()

    const status = await system.protocol.readProtocolStatus()
    expect(status.totalDebtMicroStable).toBe(stableAmount(150n))
  }, TEST_TIMEOUT)

  it("supports repeated deposit and mint sequences", async () => {
    const system = await deploySystem()
    await createVault(system)

    await depositCollateral(system, 1n, system.owner, 100n * MICRO_ALGO)
    await mintStablecoin(system, 1n, system.owner, stableAmount(50n))
    await depositCollateral(system, 1n, system.owner, 50n * MICRO_ALGO)
    await mintStablecoin(system, 1n, system.owner, stableAmount(50n))

    const vault = await system.protocol.readVault({
      args: { vaultId: 1 },
      boxReferences: [vaultBox(system.protocol.appId, 1n)],
    })
    expect(vault.collateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))

    const status = await system.protocol.readProtocolStatus()
    expect(status.totalCollateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(status.totalDebtMicroStable).toBe(stableAmount(100n))
    await expect(stableAssetBalance(addressString(system.owner), system.stableAssetId)).resolves.toBe(stableAmount(100n))
  }, TEST_TIMEOUT)
})
