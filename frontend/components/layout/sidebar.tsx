"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const sections = [
  {
    title: "Protocol",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Analytics", href: "/analytics" },
    ],
  },
  {
    title: "User",
    links: [
      { label: "My Vaults", href: "/vaults" },
      { label: "+ Create Vault", href: "/vaults/create" },
    ],
  },
  {
    title: "Market",
    links: [{ label: "Liquidations", href: "/liquidate" }],
  },
  {
    title: "System",
    links: [{ label: "Admin / Ops", href: "/admin" }],
  },
]

export function Sidebar() {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === "/vaults") return pathname === "/vaults"
    return pathname.startsWith(href)
  }

  return (
    <aside className="w-40 flex-shrink-0 border-r border-border bg-card flex flex-col gap-0 py-3 px-2">
      {sections.map(({ title, links }) => (
        <div key={title}>
          <div className="px-2.5 pt-3 pb-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-widest">
            {title}
          </div>
          {links.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "block w-full px-2.5 py-1.5 rounded-md text-xs transition-colors",
                isActive(href)
                  ? "bg-secondary text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      ))}
    </aside>
  )
}
