import { HttpTypes } from "@medusajs/types"
import ProductRail from "@modules/home/components/featured-products/product-rail"

export default async function FeaturedProducts({
  collections,
  region,
}: {
  collections: HttpTypes.StoreCollection[]
  region: HttpTypes.StoreRegion
}) {
  if (!collections.length) {
    return (
      <li>
        <ProductRail region={region} />
      </li>
    )
  }

  return collections.map((collection) => (
    <li key={collection.id}>
      <ProductRail collection={collection} region={region} />
    </li>
  ))
}
