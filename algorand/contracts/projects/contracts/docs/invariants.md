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

Enforced by: `applyRepay`.

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
```

Any operation that reads the oracle price rejects stale data.  This prevents
the protocol from acting on prices that may no longer reflect market conditions.

Enforced by: `validateOracle` (called inside `applyMint`, `applyWithdraw`,
`vaultHealth`, `isLiquidatable`, `liquidationOutcome`).

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
After liquidation: vault.debt' = vault.debt − repayAmount
  where repayAmount ≤ vault.debt
```

A liquidation cannot increase debt or create new debt.

Enforced by: `liquidationOutcome` (rejects `repay > debt`).

---

## I9 — Liquidation may only reduce collateral

```
After liquidation: vault.collateral' = vault.collateral − seized
  where seized ≤ vault.collateral
```

The seized amount is capped at the vault's collateral balance; the protocol
cannot seize more than exists.

Enforced by: `liquidationOutcome` (cap logic).

---

## I10 — Liquidation requires eligibility

```
Liquidation is only allowed when vault.ratio ≤ LIQUIDATION_RATIO
```

A healthy vault cannot be liquidated.

Enforced by: `isLiquidatable` called inside `liquidationOutcome`.

---

## I11 — Emergency pause halts all state changes

```
emergencyPaused = true → no vault state may change
```

When the emergency flag is set, all operations that would modify vault state
are rejected.

Enforced by: every `apply*` function and `liquidationOutcome`.

---

## I12 — Mint pause halts minting only

```
mintPaused = true → applyMint rejected
```

Repayments and withdrawals remain available so users can reduce risk even when
minting is paused.

Enforced by: `applyMint`, `validateMint`.

---

## I13 — Closed vault has zero balances

```
After applyClose: vault.collateral = 0 ∧ vault.debt = 0
```

A vault can only be closed when debt is already zero; the operation then zeroes
the collateral (caller receives the collateral in the on-chain implementation).

Enforced by: `applyClose` (rejects non-zero debt).

---

## Invariant testing coverage

The test suite in `tests/math/` covers:

| Invariant | Test file | Key scenario |
|-----------|-----------|--------------|
| I1 | `vault.test.ts` | Mint and withdraw at exact 150 % boundary |
| I2 | `edge-cases.test.ts` | Zero collateral, zero debt cases |
| I3 | `vault.test.ts`, `edge-cases.test.ts` | Dust repay rejection |
| I4 | `minting.test.ts` | Vault cap exceeded |
| I5 | `minting.test.ts` | Protocol ceiling at, above boundary |
| I6 | `edge-cases.test.ts` | Stale price on mint, withdraw, liquidate |
| I7 | (built into `validateOracle`) | |
| I8 | `liquidation.test.ts` | Repay exceeds debt rejection |
| I9 | `liquidation.test.ts` | Full liquidation caps at collateral |
| I10 | `liquidation.test.ts` | Healthy vault rejected; 150 % accepted |
| I11 | `edge-cases.test.ts` | Emergency pause blocks all ops |
| I12 | `edge-cases.test.ts` | Mint pause does not block repay/withdraw |
| I13 | `vault.test.ts` | Close with debt fails; close after repay succeeds |
