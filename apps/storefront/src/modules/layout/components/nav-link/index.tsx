"use client"

import { useParams, usePathname } from "next/navigation"
import React from "react"

import { clx } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type NavLinkProps = {
  href: string
  children: React.ReactNode
  "data-testid"?: string
}

const NavLink = ({ href, children, ...props }: NavLinkProps) => {
  const pathname = usePathname()
  const { countryCode } = useParams()
  const target = `/${countryCode}${href}`
  const isActive = pathname === target || pathname.startsWith(target + "/")

  return (
    <LocalizedClientLink
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={clx(
        "inline-flex h-10 items-center rounded-full px-3.5 font-semibold transition-colors",
        isActive
          ? "bg-brand-50 text-brand-800"
          : "text-ink-muted hover:bg-brand-50 hover:text-brand-800"
      )}
      {...props}
    >
      {children}
    </LocalizedClientLink>
  )
}

export default NavLink
