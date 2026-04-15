# Protocol Invariants

Formal properties that must hold at all times. Any state transition that would
violate an invariant must be rejected with an appropriate `ProtocolError`.

---

## I1 — Solvency: every unit of debt is overcollateralized

```
∀ vault v: v.debt > 0 →
  collateralValue(v.collateral, currentPrice) / v.debt ≥ MIN_COLLATERAL_RATIO
```

Enforced by: `applyMint`, `applyWithdraw`.

---

## I2 — No negative collateral or debt

```
∀ vault v:
  v.collateralMicroAlgo ≥ 0
  v.debtMicroStable ≥ 0
```

Enforced implicitly: bigint type prevents negatives; all subtraction operations
are checked before executing.

---

## I3 — Debt floor: no dust positions

```
∀ vault v: v.debt > 0 → v.debt ≥ MIN_DEBT_FLOOR
```

A vault that has carried debt must always have at least `MIN_DEBT_FLOOR`
outstanding, or zero (fully repaid).  This prevents economically unviable
micro-positions that would cost more to liquidate than they are worth.

Enforced by: `applyRepay` and on-chain `repay`.

---

## I4 — Per-vault mint cap

```
∀ vault v: v.debtMicroStable ≤ VAULT_MINT_CAP
```

No single vault can mint more than the per-vault cap regardless of collateral.
Limits concentration risk.

Enforced by: `applyMint`, `validateMint`.

---

## I5 — Protocol debt ceiling

```
Σ v.debtMicroStable ≤ PROTOCOL_DEBT_CEILING
```

Total algoUSD outstanding across all vaults is bounded.

Enforced by: `applyMint`, `validateProtocolDebtCeiling`.

---

## I6 — Oracle freshness

```
currentTime − price.updatedAt ≤ ORACLE_FRESHNESS_WINDOW
price.updatedRound ≤ Global.round
```

Any operation that reads the oracle price rejects stale data.  This prevents
the protocol from acting on prices that may no longer reflect market conditions.
The adapter also rejects future timestamps, future rounds, and non-monotonic
round updates so a trusted updater cannot accidentally move the feed backward.

Enforced by: the on-chain oracle adapter helper used by mint, debt-bearing
withdrawals, and liquidation.

---

## I7 — Oracle price validity

```
price.pricePerAlgoMicroUsd > 0
```

A zero price would produce divide-by-zero in collateral ratio calculations.

Enforced by: `validateOracle`.

---

## I8 — Liquidation may only reduce outstanding debt

```
After liquidation: vault is deleted and
  totalDebtMicroStable' = totalDebtMicroStable − vault.debt
  stableController.issuedSupplyMicroStable' =
    stableController.issuedSupplyMicroStable − vault.debt
```

A liquidation cannot increase debt, create new debt, or partially repay debt.
The grouped repayment transfer must equal exactly the vault debt.

Enforced by: on-chain `liquidate` and `burnForVault`.

---

## I9 — Liquidation may only reduce collateral

```
After liquidation:
  totalCollateralMicroAlgo' = totalCollateralMicroAlgo − vault.collateral
  liquidatorCollateral + protocolFeeCollateral + ownerRefundCollateral =
    vault.collateral
```

The liquidator payout is capped at the vault's collateral balance; protocol fee
collateral is capped at what remains after the liquidator reward; any surplus is
returned to the original vault owner.

Enforced by: centralized liquidation math in `risk.algo.ts` and on-chain
`liquidate`.

---

## I10 — Liquidation requires eligibility

```
Liquidation is only allowed when vault.ratio ≤ LIQUIDATION_RATIO
```

A healthy vault cannot be liquidated. The threshold is inclusive, so a vault
exactly at `LIQUIDATION_RATIO` is liquidatable.

Enforced by: `isLiquidatableDebt` and on-chain `liquidate`.

---

## I11 — Emergency pause halts all user state changes

```
emergency pause active → no user vault state may change
```

When the emergency flag is set, user operations that would create, deposit,
mint, repay, withdraw, close, or liquidate are rejected. Admin configuration
remains available so governance can unpause or rotate integrations.

Enforced by: on-chain `assertNotPaused`, which applies the emergency bit before
action-specific pause bits.

---

## I12 — Action pause flags halt only selected flows

```
mintPaused = true → mint rejected
repayPaused = true → repay rejected
withdrawPaused = true → withdraw and close rejected
```

Repayments and withdrawals remain available when only minting is paused so users
can reduce risk. Repay and withdraw have their own pause bits for emergency
response.

Enforced by: `applyMint`, `validateMint`, and on-chain action-specific
`assertNotPaused` checks.

---

## I13 — Closed vault is removed from active state

```
After close: vault box missing ∧ owner index box missing
```

A vault can only be closed when debt is already zero. The on-chain close path
returns remaining collateral to the owner, decrements aggregate collateral, and
deletes both active-discovery boxes. The pure model represents the same outcome
by zeroing collateral and debt.

Enforced by: `applyClose` (rejects non-zero debt), on-chain `closeVault`, and
the debt-free full-withdraw auto-close path.

---

## I14 — Stablecoin supply equals aggregate debt

```
stableController.issuedSupplyMicroStable = Σ active vault debtMicroStable
```

Minting increments both the vault debt and stablecoin issued supply by the same
amount. Repayment decrements both values by the same amount after the user has
returned stablecoin ASA units to the controller reserve in the same atomic
transaction group.

Liquidation also preserves this invariant by requiring full debt repayment and
calling `burnForVault` for the full vault debt before deleting the vault.

Enforced by: on-chain `mintStablecoin`, `mintForVault`, `repay`, `liquidate`,
and `burnForVault`.

---

## I15 — Collateral accounting equals active vault collateral

```
protocol.totalCollateralMicroAlgo = Σ active vault collateralMicroAlgo
```

Deposit increments both the vault collateral and aggregate collateral. Withdraw
and close decrement both before returning ALGO from the protocol app account.
Deleting a vault requires aggregate collateral for that vault to have been
removed.

Liquidation decrements `totalCollateralMicroAlgo` by the full vault collateral
when deleting the vault. Retained protocol liquidation fees are tracked in
`protocolFeeCollateralMicroAlgo` because they are no longer active vault
collateral.

Enforced by: on-chain `depositCollateral`, `withdrawCollateral`, `closeVault`,
and `liquidate`.

---

## Invariant testing coverage

The test suite in `tests/math/` covers:

| Invariant | Test file | Key scenario |
|-----------|-----------|--------------|
| I1 | `vault.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts` | Mint and withdraw at exact 150 % boundary |
| I2 | `edge-cases.test.ts` | Zero collateral, zero debt cases |
| I3 | `vault.test.ts`, `edge-cases.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts` | Dust repay rejection |
| I4 | `minting.test.ts` | Vault cap exceeded |
| I5 | `minting.test.ts` | Protocol ceiling at, above boundary |
| I6 | `edge-cases.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts`, `collateralx-liquidation.e2e.test.ts` | Stale price on mint, withdraw, liquidate |
| I7 | (built into `validateOracle`) | |
| I8 | `collateralx-liquidation.e2e.test.ts` | Incorrect full-debt repayment rejected; debt/supply cleared on success |
| I9 | `collateralx-liquidation.e2e.test.ts` | Liquidator reward, protocol fee, owner refund, and collateral totals reconcile |
| I10 | `collateralx-liquidation.e2e.test.ts` | Healthy vault rejected; exact liquidation threshold accepted |
| I11 | `edge-cases.test.ts` | Emergency pause blocks all ops |
| I12 | `edge-cases.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts` | Mint, repay, and withdraw pause behavior |
| I13 | `vault.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts` | Close with debt fails; close after repay succeeds |
| I14 | `collateralx-deposit-mint.e2e.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts`, `collateralx-liquidation.e2e.test.ts` | Mint, repay, and liquidation supply/debt reconciliation |
| I15 | `collateralx-deposit-mint.e2e.test.ts`, `collateralx-repay-withdraw-close.e2e.test.ts`, `collateralx-liquidation.e2e.test.ts` | Deposit, withdraw, close, and liquidation collateral reconciliation |
