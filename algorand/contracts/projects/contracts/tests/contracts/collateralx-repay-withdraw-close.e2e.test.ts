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
const PAUSE_REPAY = 4
const PAUSE_WITHDRAW = 8

type TestAccount = { addr: Address }

type DeployOptions = {
  minDebtFloorMicroStable?: number | bigint
  oracleUpdatedAt?: number
  oracleUpdatedRound?: number | bigint
  protocolOracleFreshnessWindowSeconds?: number | bigint
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

function vaultCreationBoxes(appId: bigint, owner: string, vaultId: bigint) {
  return [vaultBox(appId, vaultId), ownerVaultBox(appId, owner, vaultId)]
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
      pricePerAlgoMicroUsd: ONE_USD_PER_ALGO,
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
    sender: other.addr,
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

async function repayStablecoin(system: DeployedSystem, vaultId: bigint, sender: TestAccount, amountMicroStable: bigint) {
  const repayment = await fixture.algorand.createTransaction.assetTransfer({
    sender: sender.addr,
    receiver: system.stablecoin.appAddress,
    assetId: system.stableAssetId,
    amount: amountMicroStable,
  })
  await repayWithTransfer(system, vaultId, sender, repayment)
}

async function repayWithTransfer(
  system: DeployedSystem,
  vaultId: bigint,
  sender: TestAccount,
  repayment: algosdk.Transaction
) {
  await system.protocol.send.repay({
    sender: sender.addr,
    args: {
      repayment,
      vaultId,
    },
    appReferences: [system.stablecoin.appId],
    assetReferences: [system.stableAssetId],
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
    extraFee: microAlgo(1_000),
  })
}

async function withdrawCollateral(
  system: DeployedSystem,
  vaultId: bigint,
  sender: TestAccount,
  amountMicroAlgo: bigint
) {
  await system.protocol.send.withdrawCollateral({
    sender: sender.addr,
    args: {
      vaultId,
      amountMicroAlgo,
    },
    appReferences: [system.oracle.appId],
    accountReferences: [addressString(sender)],
    boxReferences: vaultLifecycleBoxes(system.protocol.appId, addressString(sender), vaultId),
    extraFee: microAlgo(1_000),
  })
}

async function closeVault(system: DeployedSystem, vaultId: bigint, sender: TestAccount) {
  await system.protocol.send.closeVault({
    sender: sender.addr,
    args: {
      vaultId,
    },
    accountReferences: [addressString(sender)],
    boxReferences: vaultLifecycleBoxes(system.protocol.appId, addressString(sender), vaultId),
    extraFee: microAlgo(1_000),
  })
}

async function readVault(system: DeployedSystem, vaultId = 1n) {
  return system.protocol.readVault({
    args: { vaultId },
    boxReferences: [vaultBox(system.protocol.appId, vaultId)],
  })
}

async function vaultExists(system: DeployedSystem, vaultId = 1n) {
  return system.protocol.vaultExists({
    args: { vaultId },
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

async function algoBalance(address: string) {
  const accountInfo = (await fixture.context.algod.accountInformation(address).do()) as {
    amount?: number | bigint
  }
  return BigInt(accountInfo.amount ?? 0)
}

async function openVault(system: DeployedSystem, collateralMicroAlgo: bigint, debtMicroStable: bigint, vaultId = 1n) {
  await createVault(system, system.owner, vaultId)
  await depositCollateral(system, vaultId, system.owner, collateralMicroAlgo)
  await mintStablecoin(system, vaultId, system.owner, debtMicroStable)
}

describe("CollateralX repay, withdraw, and close workflow", () => {
  it("repays debt, retires issued supply, withdraws safely, and closes after full repay", async () => {
    const system = await deploySystem()
    await openVault(system, 300n * MICRO_ALGO, stableAmount(100n))

    const wrongReceiverRepayment = await fixture.algorand.createTransaction.assetTransfer({
      sender: system.owner.addr,
      receiver: system.other.addr,
      assetId: system.stableAssetId,
      amount: 1n,
    })
    await expect(repayWithTransfer(system, 1n, system.owner, wrongReceiverRepayment)).rejects.toThrow(
      /repay receiver mismatch/
    )
    await expect(readVault(system)).resolves.toMatchObject({ debtMicroStable: stableAmount(100n) })

    await repayStablecoin(system, 1n, system.owner, stableAmount(40n))

    let vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(300n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(60n))

    let protocolStatus = await system.protocol.readProtocolStatus()
    expect(protocolStatus.totalDebtMicroStable).toBe(stableAmount(60n))

    let stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(stableAmount(60n))
    await expect(stableAssetBalance(addressString(system.owner), system.stableAssetId)).resolves.toBe(stableAmount(60n))
    await expect(stableAssetBalance(appAddressString(system.stablecoin), system.stableAssetId)).resolves.toBe(
      RESERVE_SUPPLY - stableAmount(60n)
    )

    await withdrawCollateral(system, 1n, system.owner, 210n * MICRO_ALGO)
    vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(90n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(60n))

    protocolStatus = await system.protocol.readProtocolStatus()
    expect(protocolStatus.totalCollateralMicroAlgo).toBe(90n * MICRO_ALGO)

    await repayStablecoin(system, 1n, system.owner, stableAmount(60n))
    vault = await readVault(system)
    expect(vault.debtMicroStable).toBe(0n)
    stablecoinState = await system.stablecoin.readStablecoinControlState()
    expect(stablecoinState.issuedSupplyMicroStable).toBe(0n)
    await expect(stableAssetBalance(appAddressString(system.stablecoin), system.stableAssetId)).resolves.toBe(
      RESERVE_SUPPLY
    )

    const ownerBalanceBeforeClose = await algoBalance(addressString(system.owner))
    await closeVault(system, 1n, system.owner)

    await expect(vaultExists(system)).resolves.toBe(false)
    protocolStatus = await system.protocol.readProtocolStatus()
    expect(protocolStatus.totalCollateralMicroAlgo).toBe(0n)
    expect(protocolStatus.totalDebtMicroStable).toBe(0n)
    await expect(algoBalance(addressString(system.owner))).resolves.toBeGreaterThan(
      ownerBalanceBeforeClose + 89n * MICRO_ALGO
    )
  }, TEST_TIMEOUT)

  it("rejects withdrawals that would leave the vault unhealthy", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))

    await expect(withdrawCollateral(system, 1n, system.owner, 1n)).rejects.toThrow(/withdraw unhealthy/)

    const vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))
  }, TEST_TIMEOUT)

  it("rejects explicit close while debt is outstanding", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))

    await expect(closeVault(system, 1n, system.owner)).rejects.toThrow(/debt not zero/)

    await expect(vaultExists(system)).resolves.toBe(true)
    const status = await system.protocol.readProtocolStatus()
    expect(status.totalCollateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(status.totalDebtMicroStable).toBe(stableAmount(100n))
  }, TEST_TIMEOUT)

  it("rejects withdrawal health checks against stale oracle data", async () => {
    const system = await deploySystem({
      oracleUpdatedAt: (await freshTimestamp()) - 10,
    })
    await openVault(system, 300n * MICRO_ALGO, stableAmount(100n))
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

    await expect(withdrawCollateral(system, 1n, system.owner, MICRO_ALGO)).rejects.toThrow(/oracle stale/)

    const vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(300n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))
  }, TEST_TIMEOUT)

  it("enforces repay and withdraw pause flags without corrupting accounting", async () => {
    const system = await deploySystem()
    await openVault(system, 150n * MICRO_ALGO, stableAmount(100n))

    await system.protocol.send.adminSetPauseFlags({ args: { pauseFlags: PAUSE_REPAY } })
    await expect(repayStablecoin(system, 1n, system.owner, stableAmount(1n))).rejects.toThrow(/action paused/)

    await system.protocol.send.adminSetPauseFlags({ args: { pauseFlags: 0 } })
    await repayStablecoin(system, 1n, system.owner, stableAmount(100n))
    await system.protocol.send.adminSetPauseFlags({ args: { pauseFlags: PAUSE_WITHDRAW } })

    await expect(withdrawCollateral(system, 1n, system.owner, MICRO_ALGO)).rejects.toThrow(/action paused/)
    await expect(closeVault(system, 1n, system.owner)).rejects.toThrow(/action paused/)

    const vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(150n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(0n)
    const status = await system.protocol.readProtocolStatus()
    expect(status.totalDebtMicroStable).toBe(0n)
    expect(status.totalCollateralMicroAlgo).toBe(150n * MICRO_ALGO)
  }, TEST_TIMEOUT)

  it("rejects non-owner repay and withdraw attempts", async () => {
    const system = await deploySystem()
    await openVault(system, 300n * MICRO_ALGO, stableAmount(100n))
    await fixture.algorand.send.assetTransfer({
      sender: system.owner.addr,
      receiver: system.other.addr,
      assetId: system.stableAssetId,
      amount: stableAmount(10n),
    })

    await expect(repayStablecoin(system, 1n, system.other, stableAmount(10n))).rejects.toThrow(/vault owner only/)
    await expect(withdrawCollateral(system, 1n, system.other, MICRO_ALGO)).rejects.toThrow(/vault owner only/)

    const vault = await readVault(system)
    expect(vault.collateralMicroAlgo).toBe(300n * MICRO_ALGO)
    expect(vault.debtMicroStable).toBe(stableAmount(100n))
  }, TEST_TIMEOUT)

  it("applies dust cleanup rules and auto-closes when debt-free collateral is fully withdrawn", async () => {
    const system = await deploySystem({ minDebtFloorMicroStable: MICRO_STABLE })
    await openVault(system, 10n * MICRO_ALGO, stableAmount(2n))

    await expect(repayStablecoin(system, 1n, system.owner, 1_500_000n)).rejects.toThrow(/debt below floor/)
    let vault = await readVault(system)
    expect(vault.debtMicroStable).toBe(stableAmount(2n))

    await repayStablecoin(system, 1n, system.owner, stableAmount(2n))
    vault = await readVault(system)
    expect(vault.debtMicroStable).toBe(0n)

    await withdrawCollateral(system, 1n, system.owner, 10n * MICRO_ALGO)

    await expect(vaultExists(system)).resolves.toBe(false)
    const status = await system.protocol.readProtocolStatus()
    expect(status.totalCollateralMicroAlgo).toBe(0n)
    expect(status.totalDebtMicroStable).toBe(0n)
  }, TEST_TIMEOUT)
})
