import {
  retrieveMerchantConfiguration,
  retrieveMerchantTheme,
} from "@lib/data/merchant"
import { PLATFORM_NAME } from "@lib/constants"
import { LockClosedSolidMini } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import ChevronDown from "@modules/common/icons/chevron-down"
import StoreIdentity from "@modules/layout/components/store-identity"

export default async function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [merchant, theme] = await Promise.all([
    retrieveMerchantConfiguration(),
    retrieveMerchantTheme(),
  ])
  const branding = theme?.configuration?.branding
  const storeName = branding?.name || merchant.name

  return (
    <div className="w-full bg-white relative small:min-h-screen">
      <div
        aria-hidden="true"
        className="h-1 bg-gradient-to-r from-brand-800 via-brand-500 to-brand-300"
      />
      <div className="h-16 bg-white border-b border-ink/10">
        <nav className="flex h-full items-center content-container justify-between gap-3">
          <LocalizedClientLink
            href="/cart"
            className="flex flex-1 basis-0 items-center gap-x-2 text-sm font-semibold text-ink-muted hover:text-brand-800"
            data-testid="back-to-cart-link"
          >
            <ChevronDown className="rotate-90" size={16} />
            <span className="hidden small:block">Back to cart</span>
            <span className="block small:hidden">Back</span>
          </LocalizedClientLink>
          {/* Shoppers must see who they are paying before approving M-PESA. */}
          <LocalizedClientLink
            href="/"
            className="min-w-0 rounded-full"
            data-testid="store-link"
          >
            <StoreIdentity name={storeName} logoUrl={branding?.logo_url} />
          </LocalizedClientLink>
          <div className="flex flex-1 basis-0 justify-end">
            <span className="hidden items-center gap-1.5 text-sm font-semibold text-brand-800 xsmall:inline-flex">
              <LockClosedSolidMini aria-hidden="true" />
              Secure checkout
            </span>
          </div>
        </nav>
      </div>
      <div className="relative" data-testid="checkout-container">{children}</div>
      <div className="py-6 w-full flex items-center justify-center text-sm text-ink-muted">
        Powered by{" "}
        <span className="ml-1 whitespace-nowrap font-bold text-brand-800">
          {PLATFORM_NAME}
        </span>
      </div>
    </div>
  )
}
