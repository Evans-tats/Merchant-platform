import { Suspense } from "react"

import {
  listMerchantPages,
  retrieveMerchantConfiguration,
  retrieveMerchantTheme,
} from "@lib/data/merchant"
import { listLocales } from "@lib/data/locales"
import { getLocale } from "@lib/data/locale-actions"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import CartLink from "@modules/layout/components/cart-button/cart-link"
import NavLink from "@modules/layout/components/nav-link"
import SideMenu from "@modules/layout/components/side-menu"
import StoreIdentity from "@modules/layout/components/store-identity"

export default async function Nav() {
  const [
    regions,
    locales,
    currentLocale,
    merchant,
    theme,
    pages,
  ] = await Promise.all([
    listRegions().then((regions: StoreRegion[]) => regions),
    listLocales(),
    getLocale(),
    retrieveMerchantConfiguration(),
    retrieveMerchantTheme(),
    listMerchantPages(),
  ])
  const branding = theme?.configuration?.branding
  const storeName = branding?.name || merchant.name
  const navPages = pages
    .filter(({ show_in_navigation }) => show_in_navigation)
    .slice(0, 4)
    .map((page) => ({
      href: "/pages/" + page.slug,
      label: page.navigation_label || page.title,
    }))

  // Desktop shows every link inline, so the menu is only needed there when
  // it also offers a region or language choice.
  const hasDesktopMenu =
    (regions?.length ?? 0) > 1 || (locales?.length ?? 0) > 1

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <div
        aria-hidden="true"
        className="h-1 bg-gradient-to-r from-brand-800 via-brand-500 to-brand-300"
      />
      <header className="relative h-16 mx-auto border-b border-ink/10 bg-white">
        <nav
          aria-label="Main"
          className="content-container flex items-center justify-between gap-3 w-full h-full text-sm"
        >
          <div className="flex items-center gap-1 min-w-0 h-full">
            <div className={clx("h-full", { "small:hidden": !hasDesktopMenu })}>
              <SideMenu
                regions={regions}
                locales={locales}
                currentLocale={currentLocale}
                storeName={storeName}
                pages={navPages}
              />
            </div>
            <LocalizedClientLink
              href="/"
              className="min-w-0 rounded-full"
              data-testid="nav-store-link"
            >
              <StoreIdentity name={storeName} logoUrl={branding?.logo_url} />
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-1 h-full">
            <div className="hidden small:flex items-center gap-x-1 h-full">
              <NavLink href="/store">Shop</NavLink>
              {navPages.map((page) => (
                <NavLink key={page.href} href={page.href}>
                  {page.label}
                </NavLink>
              ))}
              <NavLink href="/account" data-testid="nav-account-link">
                Account
              </NavLink>
            </div>
            <Suspense fallback={<CartLink totalItems={0} />}>
              <CartButton />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}
