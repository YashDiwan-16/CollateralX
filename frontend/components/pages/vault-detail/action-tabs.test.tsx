import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ActionTabs } from "@/components/pages/vault-detail/action-tabs"
import { createMockSnapshot } from "@/lib/protocol/mock-data"
import { MICRO_ALGO } from "@/lib/protocol/constants"
import type { ProtocolActions } from "@/lib/protocol/types"

function setup() {
  const snapshot = createMockSnapshot()
  const vault = snapshot.userVaults[0]
  const actions: ProtocolActions = {
    createVault: vi.fn(),
    depositCollateral: vi.fn().mockResolvedValue({ txId: "tx", simulated: true, message: "ok" }),
    mintStablecoin: vi.fn().mockResolvedValue({ txId: "tx", simulated: true, message: "ok" }),
    repayStablecoin: vi.fn().mockResolvedValue({ txId: "tx", simulated: true, message: "ok" }),
    withdrawCollateral: vi.fn().mockResolvedValue({ txId: "tx", simulated: true, message: "ok" }),
    liquidateVault: vi.fn(),
  }

  render(
    <ActionTabs
      vault={vault}
      snapshot={snapshot}
      actions={actions}
      pendingAction={null}
      lastResult={null}
      error={null}
      isOwner
    />
  )

  return { actions, vault }
}

describe("ActionTabs", () => {
  it("submits a validated collateral deposit", async () => {
    const { actions, vault } = setup()

    fireEvent.change(screen.getByTestId("deposit-amount"), { target: { value: "10" } })
    fireEvent.click(screen.getByTestId("deposit-submit"))

    await waitFor(() => {
      expect(actions.depositCollateral).toHaveBeenCalledWith(vault.id, 10n * MICRO_ALGO)
    })
  })

  it("blocks minting beyond the safe limit", () => {
    setup()

    fireEvent.click(screen.getByText("Mint algoUSD"))
    fireEvent.change(screen.getByTestId("mint-amount"), { target: { value: "999999" } })

    expect(screen.getByText("Mint amount exceeds the safe limit.")).toBeInTheDocument()
    expect(screen.getByTestId("mint-submit")).toBeDisabled()
  })
})
