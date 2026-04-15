"use client"

import { useState } from "react"
import Image from "next/image"
import { useWallet } from "@txnlab/use-wallet-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// Wallet brand colors for the glow/border effect
const walletColors: Record<string, string> = {
  pera: "hover:border-orange-500/40 hover:bg-orange-500/5",
  defly: "hover:border-blue-500/40 hover:bg-blue-500/5",
  lute: "hover:border-emerald-500/40 hover:bg-emerald-500/5",
  exodus: "hover:border-purple-500/40 hover:bg-purple-500/5",
}

export function ConnectWalletModal() {
  const { wallets, activeAddress } = useWallet()
  const [open, setOpen] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeWallet = wallets?.find((w) => w.isActive)

  async function handleConnect(walletId: string) {
    const wallet = wallets?.find((w) => w.id === walletId)
    if (!wallet) return
    setConnecting(walletId)
    setError(null)
    try {
      await wallet.connect()
      setOpen(false)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection failed"
      // User cancelled — don't show as error
      if (!msg.toLowerCase().includes("cancel") && !msg.toLowerCase().includes("reject")) {
        setError(msg)
      }
    } finally {
      setConnecting(null)
    }
  }

  async function handleDisconnect() {
    if (activeWallet) {
      await activeWallet.disconnect()
    }
    setOpen(false)
  }

  // ── Connected state: address pill with dropdown ──
  if (activeAddress) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          className="flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-md border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          {shortenAddress(activeAddress)}
        </DialogTrigger>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-sm">Wallet connected</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {/* Wallet info */}
            <div className="bg-background rounded-lg p-3 border border-border">
              {activeWallet && (
                <div className="flex items-center gap-2.5 mb-2">
                  {activeWallet.metadata.icon && (
                    <Image
                      src={activeWallet.metadata.icon}
                      alt={activeWallet.metadata.name}
                      width={20}
                      height={20}
                      className="rounded-md"
                    />
                  )}
                  <span className="text-xs font-medium">{activeWallet.metadata.name}</span>
                </div>
              )}
              <p className="font-mono text-[11px] text-muted-foreground break-all">{activeAddress}</p>
            </div>

            {/* Account switcher if multiple */}
            {activeWallet && activeWallet.accounts.length > 1 && (
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider px-1">Accounts</p>
                {activeWallet.accounts.map((acc) => (
                  <button
                    key={acc.address}
                    onClick={() => activeWallet.setActiveAccount(acc.address)}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-md text-xs transition-colors",
                      acc.address === activeAddress
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", acc.address === activeAddress ? "bg-emerald-400" : "bg-border")} />
                    <span className="font-mono truncate">{shortenAddress(acc.address)}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-1.5">
              <button
                onClick={() => { navigator.clipboard.writeText(activeAddress); setOpen(false) }}
                className="w-full text-left px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
              >
                Copy address
              </button>
              <button
                onClick={handleDisconnect}
                className="w-full text-left px-3 py-2 rounded-md text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  // ── Disconnected state: connect modal ──
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setError(null) }}>
      <DialogTrigger className="text-[11px] px-3 py-1 rounded-md border border-border text-foreground hover:bg-secondary/60 transition-colors cursor-pointer">
        Connect Wallet
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Connect a wallet</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Choose a wallet to connect to CollateralX on Algorand.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}

          <div className="grid gap-2 pt-1">
            {wallets?.map((wallet) => {
              const isConnecting = connecting === wallet.id
              const colorClass = walletColors[wallet.id] ?? "hover:border-border hover:bg-secondary/60"

              return (
                <button
                  key={wallet.id}
                  onClick={() => handleConnect(wallet.id)}
                  disabled={!!connecting}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-border bg-background",
                    "text-left transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
                    colorClass
                  )}
                >
                  {wallet.metadata.icon ? (
                    <Image
                      src={wallet.metadata.icon}
                      alt={wallet.metadata.name}
                      width={32}
                      height={32}
                      className="rounded-lg flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-secondary flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{wallet.metadata.name}</div>
                    <div className="text-[10px] text-muted-foreground capitalize">{wallet.id} wallet</div>
                  </div>
                  {isConnecting && (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin text-muted-foreground flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>

          <p className="text-[10px] text-muted-foreground text-center pt-1">
            By connecting you agree to interact with the CollateralX protocol smart contracts on Algorand Mainnet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
