# Liquidation Model

## Overview

CollateralX uses an overcollateralized design: every algoUSD in circulation is
backed by at least 150 % of its value in ALGO.  When a vault's collateral ratio
falls to or below 150 %, any address can trigger a liquidation by repaying part
(or all) of the vault's debt in exchange for a discounted portion of the
collateral.

---

## Units

| Symbol | Meaning |
|--------|---------|
| μAlgo | micro-ALGO (1 ALGO = 1 000 000 μAlgo) |
| μStable | micro-algoUSD (1 algoUSD = 1 000 000 μStable) |
| μUsd | micro-USD (1 USD = 1 000 000 μUsd); oracle price is expressed as μUsd per ALGO |
| bps | basis points (10 000 bps = 100 %) |

All arithmetic uses bigint; no floating-point is ever used.

---

## Collateral Value

```
collateral_μUsd = collateral_μAlgo × price_μUsd_per_ALGO / 1_000_000
```

Both `collateral_μAlgo` and `price_μUsd_per_ALGO` are in micro-units, so
dividing by 1 000 000 cancels one micro-prefix and yields μUsd.

---

## Collateral Ratio

```
ratio_bps = (collateral_μUsd / debt_μStable) × 10_000
```

`collateral_μUsd` and `debt_μStable` share the same micro-scale (1 unit of each
= $10⁻⁶), so no conversion is required before dividing.

A ratio of 15 000 bps equals 150 %.

---

## Liquidation Price

The ALGO spot price at which the vault's ratio would hit exactly the liquidation
threshold:

```
liq_price_μUsd = (debt_μStable × liq_ratio_bps × 1_000_000)
                 / (collateral_μAlgo × 10_000)
```

When the oracle price falls to or below `liq_price_μUsd`, the vault is
liquidatable.

---

## Liquidation Eligibility

A vault is liquidatable when both conditions hold:

1. `debt_μStable > 0`
2. `ratio_bps ≤ liquidation_ratio_bps`  (default: 15 000 bps = 150 %)

A vault with zero collateral and non-zero debt is always liquidatable.

---

## Liquidation Collateral Seizure

The liquidator repays `repay_μStable` of the vault debt and receives discounted
collateral in return. Three values are computed:

### Step 1 — Convert repay to USD

```
repay_μUsd = repay_μStable × price_μUsd / 1_000_000
```

### Step 2 — Total collateral to seize (includes liquidator bonus)

```
total_seized_μUsd = repay_μUsd × (10_000 + bonus_bps) / 10_000
```

Default `bonus_bps` = 500 (5 %).

### Step 3 — Protocol fee (penalty)

```
penalty_μUsd = repay_μUsd × penalty_bps / 10_000
```

Default `penalty_bps` = 1 000 (10 %).

### Step 4 — Convert back to ALGO

```
total_seized_μAlgo = ceil(total_seized_μUsd × 1_000_000 / price_μUsd)
penalty_μAlgo      = floor(penalty_μUsd × 1_000_000 / price_μUsd)
liquidator_μAlgo   = total_seized_μAlgo − penalty_μAlgo
```

`ceil` is used for the seizure so the vault is never under-charged; `floor` is
used for the penalty so the protocol never over-claims.

### Step 5 — Cap at vault collateral

If `total_seized_μAlgo > vault.collateral_μAlgo`, the seized amount is capped:

```
actual_seized = min(total_seized_μAlgo, vault.collateral_μAlgo)
actual_penalty = min(penalty_μAlgo, actual_seized)
liquidator_gets = actual_seized − actual_penalty
```

---

## Example

**Setup**: 140 ALGO collateral, $100 debt, price = $1.00, ratio = 140 %
(liquidatable).  Liquidator repays $50.

| Quantity | Calculation | Value |
|----------|-------------|-------|
| repay_μUsd | 50 × 1 000 000 / 1 000 000 | 50 000 000 |
| total_seized_μUsd | 50 000 000 × 10 500 / 10 000 | 52 500 000 |
| penalty_μUsd | 50 000 000 × 1 000 / 10 000 | 5 000 000 |
| total_seized_μAlgo | ceil(52 500 000 × 1 000 000 / 1 000 000) | 52 500 000 |
| penalty_μAlgo | floor(5 000 000 × 1 000 000 / 1 000 000) | 5 000 000 |
| liquidator_gets | 52 500 000 − 5 000 000 | 47 500 000 μAlgo (47.5 ALGO) |

After liquidation the vault holds 87.5 ALGO collateral and $50 debt.

---

## Rounding Policy

All values that favour the **protocol** (collateral seized) are rounded up
(`mulDivUp`), ensuring the vault is never under-charged.  All values that
favour the **user** (max mintable, protocol penalty) are rounded down (`mulDiv`
floor division), ensuring the system never promises more than it can deliver.
