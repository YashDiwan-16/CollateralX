# Liquidation Model

## Overview

CollateralX v1 uses full liquidation only. When a vault's collateral ratio is at
or below the configured liquidation threshold, any address may repay the full
vault debt in cxUSD and receive ALGO collateral from the vault according to the
configured bonus. A configured protocol penalty is retained by the protocol app
as fee collateral and tracked in global state.

This keeps the MVP liquidation path small and auditable:

1. No partial close factor.
2. No residual debt.
3. No dust after liquidation.
4. One vault box cleanup path.
5. One stablecoin retirement amount: exactly the vault debt.

## Units

| Symbol | Meaning |
| --- | --- |
| `microALGO` | ALGO collateral base unit, `1 ALGO = 1_000_000 microALGO`. |
| `microStable` | cxUSD stablecoin base unit, `1 cxUSD = 1_000_000 microStable`. |
| `price` | Oracle price in microUSD per ALGO. |
| `bps` | Basis points, `10_000 = 100%`. |

cxUSD is treated as USD-denominated for v1 risk math, so `debtMicroStable` is
also the debt value in microUSD.

## Eligibility

A vault is liquidatable when all conditions hold:

| Check | Reason |
| --- | --- |
| Vault box exists and `status = active`. | Prevents repeat liquidation or stale IDs. |
| `debtMicroStable > 0`. | Debt-free vaults must be closed or withdrawn by the owner. |
| Oracle sample is fresh through the shared adapter. | Prevents liquidation against stale or paused prices. |
| `collateral * price * 10_000 <= debt * 1_000_000 * liquidationRatioBps`. | Cross-multiplied ratio check with no division-rounding edge. |
| Stablecoin transfer amount equals exactly `debtMicroStable`. | Enforces full liquidation only. |

The threshold is inclusive. A vault exactly at `liquidationRatioBps` is eligible.
A vault above the threshold is healthy for liquidation purposes and the call
fails with `vault healthy`.

## Grouped Transaction Model

`liquidate(axfer,uint64)void` requires exactly two outer transactions:

| Index | Transaction | Required Fields |
| ---: | --- | --- |
| `0` | Stablecoin ASA transfer | `sender = liquidator`, `assetReceiver = stablecoin controller app address`, `xferAsset = cxUSD ASA`, `assetAmount = vault debt`, no rekey, no asset close-out. |
| `1` | Protocol app call | `sender = same liquidator`, method `liquidate`, vault and owner-index box references, oracle and stablecoin app references, stablecoin ASA reference. |

The protocol then performs up to three inner transactions:

| Inner Action | Purpose |
| --- | --- |
| App call to `burnForVault(vaultId, debt)` | Decrements stablecoin issued supply after the outer ASA transfer has returned cxUSD to the controller reserve. |
| Payment to liquidator | Pays debt value plus configured liquidation bonus, capped by vault collateral. |
| Optional payment to vault owner | Returns surplus collateral after liquidator reward and protocol fee. |

The caller must provide enough outer fee budget for these inner transactions.
The reference tests use a conservative `20_000 microALGO` app-call fee budget to
cover opcode-budget op-up calls plus the burn and collateral-payment inners.

## Collateral Distribution

Full liquidation computes three collateral buckets:

```text
liquidatorTarget =
  ceil(debtMicroStable * 1_000_000 * (10_000 + liquidationBonusBps)
       / (price * 10_000))

protocolFeeTarget =
  floor(debtMicroStable * 1_000_000 * liquidationPenaltyBps
        / (price * 10_000))

liquidatorCollateral = min(vaultCollateral, liquidatorTarget)
remainingAfterLiquidator = vaultCollateral - liquidatorCollateral
protocolFeeCollateral = min(remainingAfterLiquidator, protocolFeeTarget)
ownerRefundCollateral = remainingAfterLiquidator - protocolFeeCollateral
```

The rounding intentionally favors protocol safety:

| Value | Rounding | Reason |
| --- | --- | --- |
| Liquidator reward | Ceiling | Ensures the liquidator is not shorted by integer truncation. |
| Protocol fee | Floor | Ensures the protocol does not over-claim fee collateral. |
| Eligibility ratio | Cross multiplication | Avoids division-rounding ambiguity at the threshold. |

If collateral is insufficient to cover the target liquidator reward and fee, the
liquidator receives as much collateral as exists and the protocol fee is capped
at the remaining collateral. This prevents underflow and keeps liquidation
available even for deeply undercollateralized vaults, although rational
liquidators will only execute when the received collateral is worth the cost.

## Accounting Effects

After a successful liquidation:

```text
vault box deleted
owner index box deleted
totalDebtMicroStable' = totalDebtMicroStable - vaultDebt
totalCollateralMicroAlgo' = totalCollateralMicroAlgo - vaultCollateral
protocolFeeCollateralMicroAlgo' =
  protocolFeeCollateralMicroAlgo + protocolFeeCollateral
stablecoinIssuedSupply' = stablecoinIssuedSupply - vaultDebt
```

`totalCollateralMicroAlgo` tracks only active vault collateral. Protocol fee
collateral is intentionally tracked separately in `pfee` because it is retained
by the app account but no longer backs an active vault.

## Example

Parameters:

| Value | Amount |
| --- | ---: |
| Vault collateral | `150 ALGO` |
| Vault debt | `100 cxUSD` |
| Oracle price | `$0.80 / ALGO` |
| Liquidation ratio | `125%` |
| Liquidation bonus | `3%` |
| Protocol penalty | `5%` |

Health:

```text
collateral value = 150 * 0.80 = 120 cxUSD
ratio = 120 / 100 = 120%
```

The vault is below the `125%` threshold and is eligible.

Distribution:

```text
liquidatorTarget = ceil(100 / 0.80 * 1.03) = 128.75 ALGO
protocolFeeTarget = floor(100 / 0.80 * 0.05) = 6.25 ALGO
ownerRefund = 150 - 128.75 - 6.25 = 15 ALGO
```

The liquidator repays `100 cxUSD`, receives `128.75 ALGO`, the protocol retains
`6.25 ALGO` as fee collateral, and the original vault owner receives the
remaining `15 ALGO`.

## Incentive Note

The v1 incentive is sufficient for an MVP because it gives liquidators a simple
positive spread when a vault still has enough collateral: they repay debt at par
and receive the debt value plus `liquidationBonusBps` in ALGO. The protocol fee
is taken only after the liquidator reward is reserved, so the fee does not turn
a normally collateralized liquidation into a guaranteed loss for the liquidator.

This design does not attempt to solve bad-debt auctions, Dutch auctions, or
multi-oracle MEV. Deeply underwater vaults may be unattractive because the
collateral cap can make the payout less than the repaid debt. For v1 that is an
accepted risk in exchange for a small, inspectable liquidation surface.

## Keeper And UI Discovery

Keepers discover candidates by scanning live `v` vault boxes, reading protocol
params via `readProtocolParams()`, reading the current oracle sample, and
applying the same cross-multiplied eligibility check off-chain. Immediately
before submitting, a keeper should re-read `readProtocolStatus()` to verify
pause flags and integration ids.

UIs should watch `VaultLiquidatedEvent`, `VaultClosedEvent`, and active box
deletions to remove liquidated vaults from active views. The liquidation event
includes liquidator, owner, debt repaid, liquidator collateral, protocol fee,
owner refund, oracle price, oracle round, and post-action aggregate counters.
