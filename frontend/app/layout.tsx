import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { WalletKitProvider } from "@/providers/wallet-provider"
import { ProtocolProvider } from "@/providers/protocol-provider"
import "./globals.css"

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "CollateralX — Algorithmic Stablecoin on Algorand",
  description: "Mint algoUSD against ALGO collateral. Transparent, overcollateralized DeFi protocol.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="h-full bg-background text-foreground">
        <WalletKitProvider>
          <ProtocolProvider>{children}</ProtocolProvider>
        </WalletKitProvider>
      </body>
    </html>
  )
}
