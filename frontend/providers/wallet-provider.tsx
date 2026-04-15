"use client"

import { useState } from "react"
import { WalletProvider, WalletManager, WalletId, NetworkId } from "@txnlab/use-wallet-react"
import { getProtocolConfig } from "@/lib/contracts/config"

function activeNetworkId() {
  const network = getProtocolConfig().network
  if (network === "mainnet") return NetworkId.MAINNET
  if (network === "testnet") return NetworkId.TESTNET
  return NetworkId.LOCALNET
}

export function WalletKitProvider({ children }: { children: React.ReactNode }) {
  const [manager] = useState(
    () =>
      new WalletManager({
        wallets: [
          WalletId.PERA,
          WalletId.DEFLY,
          {
            id: WalletId.LUTE,
            options: { siteName: "CollateralX" },
          },
          WalletId.EXODUS,
        ],
        defaultNetwork: activeNetworkId(),
      })
  )

  return <WalletProvider manager={manager}>{children}</WalletProvider>
}
