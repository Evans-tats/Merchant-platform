import { ShoppingBag } from "@medusajs/icons"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

const CartLink = ({ totalItems }: { totalItems: number }) => {
  return (
    <LocalizedClientLink
      href="/cart"
      className="relative inline-flex h-10 items-center gap-2 rounded-full pl-3 pr-2 font-semibold text-ink transition-colors hover:bg-brand-50 hover:text-brand-800"
      aria-label={`Cart, ${totalItems} ${totalItems === 1 ? "item" : "items"}`}
      data-testid="nav-cart-link"
    >
      <ShoppingBag aria-hidden="true" />
      <span className="hidden xsmall:inline">Cart</span>
      <span
        aria-hidden="true"
        className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-700 px-1.5 text-xs font-bold text-white"
      >
        {totalItems}
      </span>
    </LocalizedClientLink>
  )
}

export default CartLink
