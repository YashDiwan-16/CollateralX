"use client"

import { useState } from "react"
import { WalletProvider, WalletManager, WalletId, NetworkId } from "@txnlab/use-wallet-react"

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
        defaultNetwork: NetworkId.MAINNET,
      })
  )

  return <WalletProvider manager={manager}>{children}</WalletProvider>
}
