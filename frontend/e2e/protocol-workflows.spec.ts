import { expect, type Locator, test } from "@playwright/test"

async function enterAmount(input: Locator, value: string) {
  await input.fill(value)
  await expect(input).toHaveValue(value)
}

test("dashboard renders protocol state and liquidation summary", async ({ page }) => {
  await page.goto("/dashboard")

  await expect(page.getByText("Protocol Dashboard")).toBeVisible()
  await expect(page.getByText("Total Value Locked")).toBeVisible()
  await expect(page.getByText("Liquidation Queue Summary")).toBeVisible()
})

test("create vault flow validates and submits in mock mode", async ({ page }) => {
  await page.goto("/vaults/create")

  await enterAmount(page.getByTestId("create-collateral"), "2000")
  await enterAmount(page.getByTestId("create-mint"), "100")
  await page.getByTestId("create-submit").click()

  await expect(page).toHaveURL(/\/vaults\/213/)
  await expect(page.getByText("Vault #0213", { exact: true })).toBeVisible()
})

test("vault action flow deposits, mints, repays, and withdraws", async ({ page }) => {
  await page.goto("/vaults/211")

  await enterAmount(page.getByTestId("deposit-amount"), "1")
  await page.getByTestId("deposit-submit").click()
  await expect(page.getByText(/Collateral deposit pre-check passed/)).toBeVisible()

  await page.getByText("Mint algoUSD").click()
  await enterAmount(page.getByTestId("mint-amount"), "1")
  await page.getByTestId("mint-submit").click()
  await expect(page.getByText(/Mint simulation passed/)).toBeVisible()

  await page.getByText("Repay Debt").click()
  await enterAmount(page.getByTestId("repay-amount"), "1")
  await page.getByTestId("repay-submit").click()
  await expect(page.getByText(/Repayment accepted/)).toBeVisible()

  await page.getByText("Withdraw Collateral").click()
  await enterAmount(page.getByTestId("withdraw-amount"), "1")
  await page.getByTestId("withdraw-submit").click()
  await expect(page.getByText(/Withdrawal pre-check passed/)).toBeVisible()
})
