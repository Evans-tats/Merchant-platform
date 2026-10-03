import { HttpTypes } from "@medusajs/types"
import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

const ProductInfo = ({ product }: ProductInfoProps) => {
  return (
    <div id="product-info">
      <div className="flex flex-col gap-y-3">
        {product.collection && (
          <LocalizedClientLink
            href={`/collections/${product.collection.handle}`}
            className="w-fit text-xs font-bold uppercase tracking-wider text-brand-700 hover:text-brand-800"
          >
            {product.collection.title}
          </LocalizedClientLink>
        )}
        <Heading
          level="h1"
          className="text-3xl font-extrabold leading-tight tracking-tight text-ink small:text-4xl"
          data-testid="product-title"
        >
          {product.title}
        </Heading>

        {product.description && (
          <Text
            className="text-base text-ink-muted whitespace-pre-line"
            data-testid="product-description"
          >
            {product.description}
          </Text>
        )}
      </div>
    </div>
  )
}

export default ProductInfo
