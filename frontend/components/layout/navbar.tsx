"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useWallet } from "@txnlab/use-wallet-react"
import { ConnectWalletModal } from "@/components/wallet/connect-wallet-modal"
import { cn } from "@/lib/utils"

const navLinks = [
  { label: "Overview", href: "/" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "My Vaults", href: "/vaults" },
  { label: "Liquidations", href: "/liquidate" },
  { label: "Analytics", href: "/analytics" },
  { label: "Admin", href: "/admin" },
]

export function Navbar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/") return pathname === "/"
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-40 h-11 flex items-center justify-between px-4 bg-card border-b border-border">
      <div className="flex items-center gap-4">
        <Link href="/" className="text-[13px] font-semibold tracking-tight">
          ALGO<span className="text-muted-foreground font-normal">Stable</span>
        </Link>
        <nav className="flex items-center gap-0.5">
          {navLinks.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs transition-colors",
                isActive(href)
                  ? "text-foreground bg-secondary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <AlgoPrice />
        <ConnectWalletModal />
      </div>
    </header>
  )
}

// Separate component so useWallet only affects this small piece
function AlgoPrice() {
  return (
    <span className="text-[10px] text-muted-foreground tabular-nums">ALGO: $0.38</span>
  )
}
