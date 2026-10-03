import { getProductPrice } from "@lib/util/get-product-price"
import { isVariantInStock } from "@lib/util/product"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import QuickAdd from "./quick-add"

export default async function ProductPreview({
  product,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
}) {
  const { cheapestPrice } = getProductPrice({
    product,
  })

  // Only single-variant products can go straight into the cart; the rest
  // need a size or colour picked on the product page. Resolve that here so
  // the client component receives a few scalars instead of the product.
  const onlyVariant =
    product.variants?.length === 1 ? product.variants[0] : undefined
  const quickAddVariant =
    onlyVariant?.calculated_price?.calculated_amount != null
      ? onlyVariant
      : undefined

  return (
    <article
      className="group flex h-full flex-col rounded-2xl border border-ink/10 bg-white p-2 shadow-card transition-shadow hover:shadow-card-hover small:p-2.5"
      data-testid="product-wrapper"
    >
      <LocalizedClientLink
        href={`/products/${product.handle}`}
        className="flex flex-1 flex-col rounded-xl"
      >
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="square"
          alt={product.title}
        />
        <div className="flex flex-1 flex-col gap-1 px-1 pb-3 pt-3">
          <h3
            className="line-clamp-2 text-sm font-semibold text-ink small:text-base"
            data-testid="product-title"
          >
            {product.title}
          </h3>
          <div className="mt-auto flex flex-wrap items-baseline gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </LocalizedClientLink>
      <QuickAdd
        variantId={quickAddVariant?.id}
        inStock={!!quickAddVariant && isVariantInStock(quickAddVariant)}
        handle={product.handle}
        title={product.title}
      />
    </article>
  )
}
