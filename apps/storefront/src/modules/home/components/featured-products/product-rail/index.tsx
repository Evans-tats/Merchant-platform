import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"

import InteractiveLink from "@modules/common/components/interactive-link"
import ProductPreview from "@modules/products/components/product-preview"

export default async function ProductRail({
  collection,
  region,
}: {
  collection?: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products: pricedProducts },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      ...(collection ? { collection_id: collection.id } : {}),
      limit: 6,
      // Inventory is needed so the card knows whether it can add to cart.
      fields: "*variants.calculated_price,+variants.inventory_quantity",
    },
  })

  if (!pricedProducts.length) {
    return null
  }

  const title = collection?.title ?? "Latest products"

  return (
    <section
      aria-label={title}
      className="content-container pt-10 small:pt-14"
    >
      <div className="mb-5 flex items-end justify-between gap-4 small:mb-6">
        <h2 className="text-2xl font-extrabold tracking-tight small:text-3xl">
          {title}
        </h2>
        <InteractiveLink
          href={collection ? `/collections/${collection.handle}` : "/store"}
        >
          View all
        </InteractiveLink>
      </div>
      <ul className="grid grid-cols-2 gap-3 small:grid-cols-3 small:gap-5">
        {pricedProducts &&
          pricedProducts.map((product) => (
            <li key={product.id}>
              <ProductPreview product={product} region={region} />
            </li>
          ))}
      </ul>
    </section>
  )
}
