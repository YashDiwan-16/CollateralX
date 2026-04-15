export const MICRO_ALGO = 1_000_000n
export const MICRO_STABLE = 1_000_000n
export const BPS_DENOMINATOR = 10_000n

export const PROTOCOL_PAUSE_FLAGS = {
  deposit: 1n,
  mint: 2n,
  repay: 4n,
  withdraw: 8n,
  liquidate: 16n,
  createVault: 32n,
  emergency: 64n,
} as const

export const DEMO_OWNER_ADDRESS =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ"

export const ZERO_ADDRESS = DEMO_OWNER_ADDRESS
