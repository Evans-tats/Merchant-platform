import { defineRouteConfig } from "@medusajs/admin-sdk"

import { MerchantRoute } from "../../../components/merchant/merchant-page"
import { MerchantCatalogContent } from "../catalog/page"

const MerchantCategoriesPage = () => (
  <MerchantRoute>
    {(session) => (
      <MerchantCatalogContent session={session} section="categories" />
    )}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Categories",
}

export default MerchantCategoriesPage
