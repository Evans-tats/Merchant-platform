import { Suspense } from "react"

import { OptionValueIds } from "@lib/util/product-option-filters"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  optionValueIds,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  optionValueIds?: OptionValueIds
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "created_at"

  return (
    <div className="content-container py-6 small:py-10">
      <div className="mb-6 small:mb-8">
        <h1
          className="text-3xl font-extrabold tracking-tight small:text-4xl"
          data-testid="store-page-title"
        >
          All products
        </h1>
        <p className="mt-1 text-ink-muted">
          Browse the full catalogue and pay with M-PESA at checkout.
        </p>
      </div>
      <div
        className="flex flex-col gap-6 small:flex-row small:items-start small:gap-10"
        data-testid="category-container"
      >
        <RefinementList sortBy={sort} />
        <div className="w-full min-w-0">
          <Suspense fallback={<SkeletonProductGrid />}>
            <PaginatedProducts
              sortBy={sort}
              page={pageNumber}
              countryCode={countryCode}
              optionValueIds={optionValueIds}
            />
          </Suspense>
        </div>
      </div>
    </div>
  )
}

export default StoreTemplate
