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
const TWO_USD_PER_ALGO = 2_000_000
const STRESSED_USD_PER_ALGO = 800_000
const RESERVE_SUPPLY = 10_000_000_000_000n

type TestAccount = { addr: Address }

type DeployOptions = {
  oracleUpdatedAt?: number
  oracleUpdatedRound?: number | bigint
  oraclePricePerAlgoMicroUsd?: number
  protocolOracleFreshnessWindowSeconds?: number | bigint
}

type DeployedSystem = {
  admin: TestAccount
  owner: TestAccount
  liquidator: TestAccount
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

async function latestRound() {
  const status = (await fixture.context.algod.status().do()) as unknown as Record<string, number | bigint | undefined>
  return BigInt(status.lastRound ?? status["last-round"] ?? 0)
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

function vaultLifecycleBoxes(appId: bigint, owner: string, vaultId: bigint) {
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
  const liquidator = await fixture.context.generateAccount({ initialFunds: algo(100), suppressLog: true })
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
      updatedRound: options.oracleUpdatedRound ?? (await latestRound()),
      maxAgeSeconds: 3_600,
      source: SOURCE,
    },
  })
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
    sender: liquidator.addr,
    assetId: stableAssetId,
  })
  await protocol.send.initializeProtocol({
    args: {
      minCollateralRatioBps: 15_000,
      liquidationRatioBps: 12_500,
      liquidationPenaltyBps: 500,
      liquidationBonusBps: 300,
      oracleFreshnessWindowSeconds: options.protocolOracleFreshnessWindowSeconds ?? 3_600,
      vaultMintCapMicroStable: stableAmount(1_000_000n),
      protocolDebtCeilingMicroStable: stableAmount(1_000_000n),
      minDebtFloorMicroStable: MICRO_STABLE,
      oracleAppId: oracle.appId,
      stablecoinAppId: stablecoin.appId,
      liquidationAppId: 0,
    },
  })

  return {
    admin,
    owner,
    liquidator,
    oracle,
    protocol,
    stablecoin,
    stableAssetId,
  }
}

async function createVault(system: DeployedSystem, vaultId = 1n) {
  await system.protocol.send.createVault({
    sender: system.owner.addr,
    args: [],
    boxReferences: vaultLifecycleBoxes(system.protocol.appId, addressString(system.owner), vaultId),
  })
}

async function depositCollateral(system: DeployedSystem, vaultId: bigint, amountMicroAlgo: bigint) {
  const payment = await fixture.algorand.createTransaction.payment({
    sender: system.owner.addr,
    receiver: system.protocol.appAddress,
    amount: microAlgo(amountMicroAlgo),
  })
  await system.protocol.send.depositCollateral({
    sender: system.owner.addr,
    args: {
      vaultId,
      payment,
    },
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
  })
}

async function mintStablecoin(system: DeployedSystem, vaultId: bigint, amountMicroStable: bigint) {
  await system.protocol.send.mintStablecoin({
    sender: system.owner.addr,
    args: {
      vaultId,
      amountMicroStable,
    },
    appReferences: [system.oracle.appId, system.stablecoin.appId],
    assetReferences: [system.stableAssetId],
    accountReferences: [addressString(system.owner), appAddressString(system.stablecoin)],
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
    extraFee: microAlgo(2_000),
  })
}

async function openVault(system: DeployedSystem, collateralMicroAlgo: bigint, debtMicroStable: bigint) {
  await createVault(system)
  await depositCollateral(system, 1n, collateralMicroAlgo)
  await mintStablecoin(system, 1n, debtMicroStable)
}

async function transferDebtToLiquidator(system: DeployedSystem, amountMicroStable: bigint) {
  await fixture.algorand.send.assetTransfer({
    sender: system.owner.addr,
    receiver: system.liquidator.addr,
    assetId: system.stableAssetId,
    amount: amountMicroStable,
  })
}

async function updateOraclePrice(system: DeployedSystem, pricePerAlgoMicroUsd: number) {
  await system.oracle.send.updatePrice({
    args: {
      pricePerAlgoMicroUsd,
      updatedAt: await freshTimestamp(),
      updatedRound: await latestRound(),
      source: SOURCE,
    },
  })
}

async function liquidateWithTransfer(
  system: DeployedSystem,
  repayment: algosdk.Transaction,
  sender: TestAccount = system.liquidator
) {
  await system.protocol.send.liquidate({
    sender: sender.addr,
    args: {
      repayment,
      vaultId: 1,
    },
    appReferences: [system.oracle.appId, system.stablecoin.appId],
    assetReferences: [system.stableAssetId],
    accountReferences: [addressString(sender), addressString(system.owner)],
    boxReferences: vaultLifecycleBoxes(system.protocol.appId, addressString(system.owner), 1n),
    extraFee: microAlgo(20_000),
  })
}

async function liquidateWithAmount(system: DeployedSystem, amountMicroStable: bigint) {
  const repayment = await fixture.algorand.createTransaction.assetTransfer({
    sender: system.liquidator.addr,
    receiver: system.stablecoin.appAddress,
    assetId: system.stableAssetId,
    amount: amountMicroStable,
  })
  await liquidateWithTransfer(system, repayment)
}

async function readVault(system: DeployedSystem) {
  return system.protocol.readVault({
    args: { vaultId: 1 },
    boxReferences: [vaultBox(system.protocol.appId, 1n)],
  })
}

async function vaultExists(system: DeployedSystem) {
  return system.protocol.vaultExists({
    args: { vaultId: 1 },
    boxReferences: [vaultBox(system.protocol.appId, 1n)],
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

async function algoBalance(address: string) {
  const accountInfo = (await fixture.context.algod.accountInformation(address).do()) as {
    amount?: number | bigint
  }
  return BigInt(accountInfo.amount ?? 0)
}

describe("CollateralX liquidation workflow", () => {
  it("fully liquidates an unhealthy vault and preserves debt, collateral, fee, and supply accounting", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))
    await transferDebtToLiquidator(system, stableAmount(100n))
    await updateOraclePrice(system, STRESSED_USD_PER_ALGO)

    const liquidatorAlgoBefore = await algoBalance(addressString(system.liquidator))
    const ownerAlgoBefore = await algoBalance(addressString(system.owner))

    await liquidateWithAmount(system, stableAmount(100n))

    await expect(vaultExists(system)).resolves.toBe(false)
    await expect(readVault(system)).rejects.toThrow(/vault missing/)

    const status = await system.protocol.readProtocolStatus()
    expect(status.totalDebtMicroStable).toBe(0n)
    expect(status.totalCollateralMicroAlgo).toBe(0n)
    expect(status.protocolFeeCollateralMicroAlgo).toBe(6_250_000n)

    const stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(0n)
    await expect(stableAssetBalance(addressString(system.liquidator), system.stableAssetId)).resolves.toBe(0n)
    await expect(stableAssetBalance(appAddressString(system.stablecoin), system.stableAssetId)).resolves.toBe(
      RESERVE_SUPPLY
    )
    await expect(algoBalance(addressString(system.liquidator))).resolves.toBeGreaterThan(
      liquidatorAlgoBefore + 128n * MICRO_ALGO
    )
    await expect(algoBalance(addressString(system.owner))).resolves.toBeGreaterThan(ownerAlgoBefore + 14n * MICRO_ALGO)
  }, TEST_TIMEOUT)

  it("rejects liquidation while the vault remains above the liquidation threshold", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))
    await transferDebtToLiquidator(system, stableAmount(100n))

    await expect(liquidateWithAmount(system, stableAmount(100n))).rejects.toThrow(/vault healthy/)

    const vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))
    const status = await system.protocol.readProtocolStatus()
    expect(status.totalDebtMicroStable).toBe(stableAmount(100n))
    expect(status.totalCollateralMicroAlgo).toBe(150n * MICRO_ALGO)
  }, TEST_TIMEOUT)

  it("blocks liquidation when oracle data is stale", async () => {
    const system = await deploySystem({
      oracleUpdatedAt: (await freshTimestamp()) - 10,
    })
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))
    await transferDebtToLiquidator(system, stableAmount(100n))
    await system.protocol.send.adminSetParams({
      args: {
        minCollateralRatioBps: 15_000,
        liquidationRatioBps: 12_500,
        liquidationPenaltyBps: 500,
        liquidationBonusBps: 300,
        oracleFreshnessWindowSeconds: 1,
        vaultMintCapMicroStable: stableAmount(1_000_000n),
        protocolDebtCeilingMicroStable: stableAmount(1_000_000n),
        minDebtFloorMicroStable: MICRO_STABLE,
      },
    })

    await expect(liquidateWithAmount(system, stableAmount(100n))).rejects.toThrow(/oracle stale/)

    await expect(vaultExists(system)).resolves.toBe(true)
    const stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(stableAmount(100n))
  }, TEST_TIMEOUT)

  it("rejects incorrect liquidation repayment amount and receiver", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))
    await transferDebtToLiquidator(system, stableAmount(100n))
    await updateOraclePrice(system, STRESSED_USD_PER_ALGO)

    await expect(liquidateWithAmount(system, stableAmount(100n) - 1n)).rejects.toThrow(/liquidation repay amount/)

    const wrongReceiver = await fixture.algorand.createTransaction.assetTransfer({
      sender: system.liquidator.addr,
      receiver: system.owner.addr,
      assetId: system.stableAssetId,
      amount: stableAmount(100n),
    })
    await expect(liquidateWithTransfer(system, wrongReceiver)).rejects.toThrow(/liquidation receiver mismatch/)

    const vault = await readVault(system)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))
    await expect(stableAssetBalance(addressString(system.liquidator), system.stableAssetId)).resolves.toBe(
      stableAmount(100n)
    )
  }, TEST_TIMEOUT)

  it("rejects repeat liquidation after the vault boxes have been cleared", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))
    await transferDebtToLiquidator(system, stableAmount(100n))
    await updateOraclePrice(system, STRESSED_USD_PER_ALGO)

    await liquidateWithAmount(system, stableAmount(100n))
    await expect(liquidateWithAmount(system, 0n)).rejects.toThrow(/vault missing/)

    const status = await system.protocol.readProtocolStatus()
    expect(status.totalDebtMicroStable).toBe(0n)
    expect(status.totalCollateralMicroAlgo).toBe(0n)
  }, TEST_TIMEOUT)

  it("allows liquidation exactly at the configured liquidation threshold", async () => {
    const system = await deploySystem({ oraclePricePerAlgoMicroUsd: TWO_USD_PER_ALGO })
    await openVault(system, 125n * MICRO_ALGO, stableAmount(100n))
    await transferDebtToLiquidator(system, stableAmount(100n))
    await updateOraclePrice(system, ONE_USD_PER_ALGO)

    await liquidateWithAmount(system, stableAmount(100n))

    await expect(vaultExists(system)).resolves.toBe(false)
    const status = await system.protocol.readProtocolStatus()
    expect(status.totalDebtMicroStable).toBe(0n)
    expect(status.totalCollateralMicroAlgo).toBe(0n)
    expect(status.protocolFeeCollateralMicroAlgo).toBe(5n * MICRO_ALGO)
    const stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(0n)
  }, TEST_TIMEOUT)
})
