// Public surface of the CollateralX protocol math library.
// Import from this file, not from individual modules.

export * from "./constants"
export * from "./errors"
export * from "./types"
export { mulDiv, mulDivUp } from "./decimal"
export {
  collateralValueMicroUsd,
  collateralRatioBps,
  liquidationPriceMicroUsd,
  vaultHealth,
  isHealthy,
  minCollateralForDebt,
  applyDeposit,
  applyWithdraw,
  applyMint,
  applyRepay,
  applyClose,
} from "./vault"
export { isLiquidatable, liquidationOutcome, type LiquidationOutcome } from "./liquidation"
export { maxMintable, validateMint, validateProtocolDebtCeiling } from "./minting"
