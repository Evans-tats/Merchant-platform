import { defineRouteConfig } from "@medusajs/admin-sdk"

import { MerchantRoute } from "../../../components/merchant/merchant-page"
import { MerchantCatalogContent } from "../catalog/page"

const MerchantCollectionsPage = () => (
  <MerchantRoute>
    {(session) => (
      <MerchantCatalogContent session={session} section="collections" />
    )}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Collections",
}

export default MerchantCollectionsPage
