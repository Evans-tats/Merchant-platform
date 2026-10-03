import { clx } from "@modules/common/components/ui"

import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"

export default function ProductPrice({
  product,
  variant,
  currencyCode,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  currencyCode?: string
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    if (variant && currencyCode) {
      return (
        <span className="text-small-regular text-ui-fg-subtle">
          Unavailable in {currencyCode.toUpperCase()}
        </span>
      )
    }

    return <div className="block w-32 h-9 rounded-lg bg-sand animate-pulse" />
  }

  return (
    <div className="flex flex-col gap-1 text-ink">
      <span
        className={clx("text-3xl font-extrabold tracking-tight text-brand-700", {
          "text-ui-fg-interactive": selectedPrice.price_type === "sale",
        })}
      >
        {!variant && (
          <span className="text-base font-semibold text-ink-muted">From </span>
        )}
        <span
          data-testid="product-price"
          data-value={selectedPrice.calculated_price_number}
        >
          {selectedPrice.calculated_price}
        </span>
      </span>
      {selectedPrice.price_type === "sale" && (
        <>
          <p>
            <span className="text-ui-fg-subtle">Original: </span>
            <span
              className="line-through"
              data-testid="original-product-price"
              data-value={selectedPrice.original_price_number}
            >
              {selectedPrice.original_price}
            </span>
          </p>
          <span className="w-fit rounded-full bg-brand-50 px-2 py-0.5 text-sm font-bold text-brand-800">
            -{selectedPrice.percentage_diff}%
          </span>
        </>
      )}
    </div>
  )
}
