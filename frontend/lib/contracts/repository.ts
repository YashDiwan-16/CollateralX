import algosdk from "algosdk"
import { AlgorandClient, microAlgo } from "@algorandfoundation/algokit-utils"
import { DEMO_OWNER_ADDRESS } from "@/lib/protocol/constants"
import {
  buildSnapshotFromVaults,
  createMockSnapshot,
  defaultProtocolParams,
} from "@/lib/protocol/mock-data"
import { enrichVault, microToDecimal, spendableBalanceMicroAlgo } from "@/lib/protocol/math"
import type {
  CreateVaultInput,
  ProtocolActionResult,
  ProtocolConfig,
  ProtocolSnapshot,
} from "@/lib/protocol/types"
import { hasRequiredChainConfig } from "@/lib/contracts/config"
import { ownerVaultBox, vaultBox, vaultLifecycleBoxes } from "@/lib/contracts/boxes"
import { CollateralXProtocolManagerFactory } from "@/lib/contracts/generated/CollateralXProtocolManagerClient"
import { CollateralXOracleAdapterFactory } from "@/lib/contracts/generated/CollateralXOracleAdapterClient"
import {
  CollateralXStablecoinControllerClient,
  CollateralXStablecoinControllerFactory,
} from "@/lib/contracts/generated/CollateralXStablecoinControllerClient"

interface RepositoryContext {
  config: ProtocolConfig
  activeAddress?: string | null
  transactionSigner?: algosdk.TransactionSigner | null
}

const BASE_ACTION_FEE_BUFFER_MICROALGO = 5_000n
const CREATE_WITH_MINT_FEE_BUFFER_MICROALGO = 10_000n

type AccountFundingState = {
  balanceMicroAlgo: bigint
  minBalanceMicroAlgo: bigint
  spendableMicroAlgo: bigint
}

function toAddress(value?: string | null) {
  return value ? algosdk.Address.fromString(value) : undefined
}

function makeAlgorand(config: ProtocolConfig, activeAddress?: string | null, signer?: algosdk.TransactionSigner | null) {
  const algorand = AlgorandClient.fromClients({
    algod: new algosdk.Algodv2(config.algodToken, config.algodServer, config.algodPort),
    indexer: new algosdk.Indexer(config.indexerToken, config.indexerServer, config.indexerPort),
  })

  // Browser wallet approvals on testnet/mainnet often take longer than the
  // 10-round default validity window. A slightly wider window avoids benign
  // "txn dead" failures during multi-step flows like create -> deposit.
  algorand.setDefaultValidityWindow(config.network === "localnet" ? 1_000 : 50)

  const address = toAddress(activeAddress)
  if (address && signer) {
    algorand.setSigner(address, signer)
  }

  return algorand
}

function getClients(ctx: RepositoryContext) {
  if (!ctx.config.protocolAppId) throw new Error("Protocol app id is not configured")

  const algorand = makeAlgorand(ctx.config, ctx.activeAddress, ctx.transactionSigner)
  const defaultSenderAddress =
    toAddress(ctx.activeAddress) ??
    toAddress(ctx.config.keeperAddress) ??
    algosdk.Address.fromString(DEMO_OWNER_ADDRESS)
  const protocol = new CollateralXProtocolManagerFactory({ algorand, defaultSender: defaultSenderAddress }).getAppClientById({
    appId: ctx.config.protocolAppId,
    defaultSender: defaultSenderAddress,
  })
  const oracle =
    ctx.config.oracleAppId &&
    new CollateralXOracleAdapterFactory({ algorand, defaultSender: defaultSenderAddress }).getAppClientById({
      appId: ctx.config.oracleAppId,
      defaultSender: defaultSenderAddress,
    })
  const stablecoin =
    ctx.config.stablecoinAppId &&
    new CollateralXStablecoinControllerFactory({ algorand, defaultSender: defaultSenderAddress }).getAppClientById({
      appId: ctx.config.stablecoinAppId,
      defaultSender: defaultSenderAddress,
    })

  return { algorand, protocol, oracle, stablecoin, defaultSender: defaultSenderAddress.toString() }
}

function bytesToUtf8(value: Uint8Array | string) {
  if (typeof value === "string") return value
  return new TextDecoder().decode(value)
}

function txIdFromResult(result: unknown) {
  const shaped = result as {
    txIds?: string[]
    transaction?: { txID?: () => string }
    transactions?: Array<{ txID?: () => string }>
  }
  return (
    shaped.txIds?.[0] ??
    shaped.transaction?.txID?.() ??
    shaped.transactions?.[0]?.txID?.() ??
    "submitted"
  )
}

function numberishToBigInt(value: number | bigint | undefined) {
  return value === undefined ? 0n : BigInt(value)
}

async function readAccountFundingState(algorand: AlgorandClient, address: algosdk.Address): Promise<AccountFundingState> {
  const accountInfo = (await algorand.client.algod.accountInformation(address.toString()).do()) as {
    amount?: number | bigint
    "min-balance"?: number | bigint
    minBalance?: number | bigint
  }
  const balanceMicroAlgo = numberishToBigInt(accountInfo.amount)
  const minBalanceMicroAlgo = numberishToBigInt(accountInfo.minBalance ?? accountInfo["min-balance"])
  return {
    balanceMicroAlgo,
    minBalanceMicroAlgo,
    spendableMicroAlgo: spendableBalanceMicroAlgo(balanceMicroAlgo, minBalanceMicroAlgo),
  }
}

function algoText(value: bigint) {
  return `${microToDecimal(value, 6, 6)} ALGO`
}

async function assertSpendableBalance(args: {
  algorand: AlgorandClient
  sender: algosdk.Address
  requiredMicroAlgo: bigint
  actionLabel: string
}) {
  const funding = await readAccountFundingState(args.algorand, args.sender)
  if (funding.spendableMicroAlgo >= args.requiredMicroAlgo) return

  throw new Error(
    `${args.actionLabel} needs ${algoText(args.requiredMicroAlgo)} spendable, but this wallet only has ` +
      `${algoText(funding.spendableMicroAlgo)} available above the Algorand minimum balance. ` +
      `Current balance: ${algoText(funding.balanceMicroAlgo)}. Minimum balance: ${algoText(funding.minBalanceMicroAlgo)}. ` +
      `Deposit less ALGO or top up the wallet first.`
  )
}

async function buildDepositCollateralParams(args: {
  algorand: AlgorandClient
  protocol: ReturnType<typeof getClients>["protocol"]
  sender: algosdk.Address
  vaultId: bigint
  amountMicroAlgo: bigint
}) {
  const payment = await args.algorand.createTransaction.payment({
    sender: args.sender,
    receiver: args.protocol.appAddress,
    amount: microAlgo(args.amountMicroAlgo),
  })

  return {
    sender: args.sender,
    args: { vaultId: args.vaultId, payment },
    boxReferences: [vaultBox(args.protocol.appId, args.vaultId)],
  }
}

async function buildRepayParams(args: {
  algorand: AlgorandClient
  protocol: ReturnType<typeof getClients>["protocol"]
  stablecoin: CollateralXStablecoinControllerClient
  sender: algosdk.Address
  stableAssetId: bigint
  vaultId: bigint
  amountMicroStable: bigint
}) {
  const repayment = await args.algorand.createTransaction.assetTransfer({
    sender: args.sender,
    receiver: args.stablecoin.appAddress,
    assetId: args.stableAssetId,
    amount: args.amountMicroStable,
  })

  return {
    sender: args.sender,
    args: { vaultId: args.vaultId, repayment },
    appReferences: [BigInt(args.stablecoin.appId)],
    assetReferences: [args.stableAssetId],
    boxReferences: [vaultBox(args.protocol.appId, args.vaultId)],
    extraFee: microAlgo(1_000),
  }
}

async function buildLiquidationParams(args: {
  algorand: AlgorandClient
  protocol: ReturnType<typeof getClients>["protocol"]
  stablecoin: CollateralXStablecoinControllerClient
  sender: algosdk.Address
  senderAddressText: string
  stableAssetId: bigint
  vault: ProtocolSnapshot["vaults"][number]
  oracleAppId: bigint
  stablecoinAppId: bigint
}) {
  const repayment = await args.algorand.createTransaction.assetTransfer({
    sender: args.sender,
    receiver: args.stablecoin.appAddress,
    assetId: args.stableAssetId,
    amount: args.vault.debtMicroStable,
  })

  return {
    sender: args.sender,
    args: { repayment, vaultId: args.vault.id },
    appReferences: [args.oracleAppId, args.stablecoinAppId],
    assetReferences: [args.stableAssetId],
    accountReferences: [args.senderAddressText, args.vault.owner],
    boxReferences: [
      vaultBox(args.protocol.appId, args.vault.id),
      ownerVaultBox(args.protocol.appId, args.vault.owner, args.vault.id),
    ],
    extraFee: microAlgo(20_000),
  }
}

export async function loadProtocolSnapshot(ctx: RepositoryContext): Promise<ProtocolSnapshot> {
  const owner = ctx.activeAddress ?? DEMO_OWNER_ADDRESS

  if (ctx.config.dataMode === "mock" || !hasRequiredChainConfig(ctx.config)) {
    return createMockSnapshot(owner)
  }

  try {
    return await loadChainSnapshot(ctx)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown chain read error"
    const fallback = createMockSnapshot(owner)
    return {
      ...fallback,
      mode: "mock",
      warnings: [`Using mock data because chain state could not be read: ${message}`],
    }
  }
}

async function loadChainSnapshot(ctx: RepositoryContext): Promise<ProtocolSnapshot> {
  const { protocol, oracle, stablecoin, defaultSender } = getClients(ctx)
  if (!oracle || !stablecoin) throw new Error("Oracle and stablecoin app ids are required")
  const snapshotOwner = ctx.activeAddress ?? DEMO_OWNER_ADDRESS

  const [status, params, oracleSample, stablecoinState] = await Promise.all([
    protocol.readProtocolStatus(),
    protocol.readProtocolParams(),
    oracle.readOraclePrice(),
    stablecoin.readStablecoinControlState(),
  ])

  const protocolParams = {
    minCollateralRatioBps: params.minCollateralRatioBps,
    liquidationRatioBps: params.liquidationRatioBps,
    liquidationPenaltyBps: params.liquidationPenaltyBps,
    liquidationBonusBps: params.liquidationBonusBps,
    oracleFreshnessWindowSeconds: params.oracleFreshnessWindowSeconds,
    vaultMintCapMicroStable: params.vaultMintCapMicroStable,
    protocolDebtCeilingMicroStable: params.protocolDebtCeilingMicroStable,
    minDebtFloorMicroStable: params.minDebtFloorMicroStable,
  }

  const totalDebtMicroStable = status.totalDebtMicroStable
  const vaults = []
  const maxVaultsToScan = Number(status.nextVaultId > 200n ? 200n : status.nextVaultId)

  for (let id = 1; id < maxVaultsToScan; id += 1) {
    try {
      const vault = await protocol.readVault({
        args: { vaultId: BigInt(id) },
        boxReferences: [vaultBox(protocol.appId, BigInt(id))],
      })
      vaults.push(
        enrichVault({
          id: vault.id,
          owner: vault.owner,
          collateralMicroAlgo: vault.collateralMicroAlgo,
          debtMicroStable: vault.debtMicroStable,
          createdAt: vault.createdAt,
          updatedAt: vault.updatedAt,
          version: vault.version,
          params: protocolParams,
          pricePerAlgoMicroUsd: oracleSample.pricePerAlgoMicroUsd,
          totalDebtMicroStable,
        })
      )
    } catch {
      // Sparse deterministic ids are expected once vault boxes have been closed.
    }
  }

  return buildSnapshotFromVaults({
    vaults,
    owner: snapshotOwner,
    mode: "chain",
    network: ctx.config.network,
    params: protocolParams,
    oracle: {
      updater: oracleSample.updater,
      pricePerAlgoMicroUsd: oracleSample.pricePerAlgoMicroUsd,
      updatedAt: oracleSample.updatedAt,
      updatedRound: oracleSample.updatedRound,
      source: bytesToUtf8(oracleSample.source),
      maxAgeSeconds: oracleSample.maxAgeSeconds,
      pauseFlags: oracleSample.pauseFlags,
      isFresh: oracleSample.isFresh,
    },
    stablecoin: {
      admin: stablecoinState.admin,
      initialized: stablecoinState.initialized === 1n,
      protocolManagerAppId: stablecoinState.protocolManagerAppId,
      stableAssetId: stablecoinState.stableAssetId,
      issuedSupplyMicroStable: stablecoinState.issuedSupplyMicroStable,
      supplyCeilingMicroStable: stablecoinState.supplyCeilingMicroStable,
      pauseFlags: stablecoinState.pauseFlags,
    },
  })
}

function requireWallet(ctx: RepositoryContext) {
  if (!ctx.activeAddress || !ctx.transactionSigner) {
    throw new Error("Connect a wallet before submitting transactions")
  }
  return algosdk.Address.fromString(ctx.activeAddress)
}

export async function createVaultOnChain(
  ctx: RepositoryContext,
  input: CreateVaultInput = {}
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol } = getClients(ctx)
  const status = await protocol.readProtocolStatus()
  const vaultId = status.nextVaultId
  const walletAddressText = walletAddress.toString()
  const boxReferences = vaultLifecycleBoxes(protocol.appId, walletAddressText, vaultId)
  const requiredSpendableMicroAlgo =
    (input.initialCollateralMicroAlgo ?? 0n) +
    BASE_ACTION_FEE_BUFFER_MICROALGO +
    ((input.initialCollateralMicroAlgo ?? 0n) > 0n ? BASE_ACTION_FEE_BUFFER_MICROALGO : 0n) +
    ((input.initialMintMicroStable ?? 0n) > 0n ? CREATE_WITH_MINT_FEE_BUFFER_MICROALGO : 0n)

  await assertSpendableBalance({
    algorand,
    sender: walletAddress,
    requiredMicroAlgo: requiredSpendableMicroAlgo,
    actionLabel: "This create-vault flow",
  })

  await protocol.newGroup().createVault({ sender: walletAddress, args: [], boxReferences }).simulate({
    skipSignatures: true,
  })
  const result = await protocol.send.createVault({
    sender: walletAddress,
    args: [],
    boxReferences,
  })

  if (input.initialCollateralMicroAlgo && input.initialCollateralMicroAlgo > 0n) {
    await depositCollateralOnChain(ctx, vaultId, input.initialCollateralMicroAlgo)
  }
  if (input.initialMintMicroStable && input.initialMintMicroStable > 0n) {
    await mintStablecoinOnChain(ctx, vaultId, input.initialMintMicroStable)
  }

  return {
    txId: txIdFromResult(result),
    vaultId,
    simulated: true,
    message: `Vault #${vaultId.toString().padStart(4, "0")} created`,
  }
}

export async function depositCollateralOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroAlgo: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol } = getClients(ctx)
  await assertSpendableBalance({
    algorand,
    sender: walletAddress,
    requiredMicroAlgo: amountMicroAlgo + BASE_ACTION_FEE_BUFFER_MICROALGO,
    actionLabel: "This collateral deposit",
  })
  // Transaction args are mutated with a group ID during simulation, so rebuild
  // them for the real submission instead of reusing the simulated object.
  const simulateParams = await buildDepositCollateralParams({
    algorand,
    protocol,
    sender: walletAddress,
    vaultId,
    amountMicroAlgo,
  })
  await protocol.newGroup().depositCollateral(simulateParams).simulate({ skipSignatures: true })

  const sendParams = await buildDepositCollateralParams({
    algorand,
    protocol,
    sender: walletAddress,
    vaultId,
    amountMicroAlgo,
  })
  const result = await protocol.send.depositCollateral(sendParams)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Collateral deposited" }
}

export async function mintStablecoinOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroStable: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol, oracle, stablecoin } = getClients(ctx)
  if (!ctx.config.oracleAppId || !ctx.config.stablecoinAppId || !oracle || !stablecoin) {
    throw new Error("Oracle and stablecoin app ids are required for minting")
  }
  await assertSpendableBalance({
    algorand,
    sender: walletAddress,
    requiredMicroAlgo: CREATE_WITH_MINT_FEE_BUFFER_MICROALGO,
    actionLabel: "This mint",
  })
  const stableState = await stablecoin.readStablecoinControlState()
  const walletAddressText = walletAddress.toString()
  const params = {
    sender: walletAddress,
    args: { vaultId, amountMicroStable },
    appReferences: [ctx.config.oracleAppId, ctx.config.stablecoinAppId],
    assetReferences: [stableState.stableAssetId],
    accountReferences: [walletAddressText, stablecoin.appAddress.toString()],
    boxReferences: [vaultBox(protocol.appId, vaultId)],
    extraFee: microAlgo(2_000),
  }

  await protocol.newGroup().mintStablecoin(params).simulate({ skipSignatures: true })
  const result = await protocol.send.mintStablecoin(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "algoUSD minted" }
}

export async function repayStablecoinOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroStable: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol, stablecoin } = getClients(ctx)
  if (!ctx.config.stablecoinAppId || !stablecoin) {
    throw new Error("Stablecoin app id is required for repayment")
  }
  await assertSpendableBalance({
    algorand,
    sender: walletAddress,
    requiredMicroAlgo: CREATE_WITH_MINT_FEE_BUFFER_MICROALGO,
    actionLabel: "This repayment",
  })
  const stableState = await stablecoin.readStablecoinControlState()
  const simulateParams = await buildRepayParams({
    algorand,
    protocol,
    stablecoin,
    sender: walletAddress,
    stableAssetId: stableState.stableAssetId,
    vaultId,
    amountMicroStable,
  })
  await protocol.newGroup().repay(simulateParams).simulate({ skipSignatures: true })

  const sendParams = await buildRepayParams({
    algorand,
    protocol,
    stablecoin,
    sender: walletAddress,
    stableAssetId: stableState.stableAssetId,
    vaultId,
    amountMicroStable,
  })
  const result = await protocol.send.repay(sendParams)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Debt repaid" }
}

export async function withdrawCollateralOnChain(
  ctx: RepositoryContext,
  vaultId: bigint,
  amountMicroAlgo: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol } = getClients(ctx)
  if (!ctx.config.oracleAppId) throw new Error("Oracle app id is required for withdrawal checks")
  await assertSpendableBalance({
    algorand,
    sender: walletAddress,
    requiredMicroAlgo: CREATE_WITH_MINT_FEE_BUFFER_MICROALGO,
    actionLabel: "This collateral withdrawal",
  })
  const walletAddressText = walletAddress.toString()
  const params = {
    sender: walletAddress,
    args: { vaultId, amountMicroAlgo },
    appReferences: [ctx.config.oracleAppId],
    accountReferences: [walletAddressText],
    boxReferences: vaultLifecycleBoxes(protocol.appId, walletAddressText, vaultId),
    extraFee: microAlgo(1_000),
  }

  await protocol.newGroup().withdrawCollateral(params).simulate({ skipSignatures: true })
  const result = await protocol.send.withdrawCollateral(params)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Collateral withdrawn" }
}

export async function liquidateVaultOnChain(
  ctx: RepositoryContext,
  snapshot: ProtocolSnapshot,
  vaultId: bigint
): Promise<ProtocolActionResult> {
  const walletAddress = requireWallet(ctx)
  const { algorand, protocol, stablecoin } = getClients(ctx)
  if (!ctx.config.oracleAppId || !ctx.config.stablecoinAppId || !stablecoin) {
    throw new Error("Oracle and stablecoin app ids are required for liquidation")
  }
  await assertSpendableBalance({
    algorand,
    sender: walletAddress,
    requiredMicroAlgo: 25_000n,
    actionLabel: "This liquidation",
  })
  const vault = snapshot.vaults.find((candidate) => candidate.id === vaultId)
  if (!vault) throw new Error("Vault not found")

  const stableState = await stablecoin.readStablecoinControlState()
  const walletAddressText = walletAddress.toString()
  const simulateParams = await buildLiquidationParams({
    algorand,
    protocol,
    stablecoin,
    sender: walletAddress,
    senderAddressText: walletAddressText,
    stableAssetId: stableState.stableAssetId,
    vault,
    oracleAppId: ctx.config.oracleAppId,
    stablecoinAppId: ctx.config.stablecoinAppId,
  })
  await protocol.newGroup().liquidate(simulateParams).simulate({ skipSignatures: true })

  const sendParams = await buildLiquidationParams({
    algorand,
    protocol,
    stablecoin,
    sender: walletAddress,
    senderAddressText: walletAddressText,
    stableAssetId: stableState.stableAssetId,
    vault,
    oracleAppId: ctx.config.oracleAppId,
    stablecoinAppId: ctx.config.stablecoinAppId,
  })
  const result = await protocol.send.liquidate(sendParams)

  return { txId: txIdFromResult(result), vaultId, simulated: true, message: "Vault liquidated" }
}

export { defaultProtocolParams }
