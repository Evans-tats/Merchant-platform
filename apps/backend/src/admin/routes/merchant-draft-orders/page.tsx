import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantDraftOrdersPage from "../merchant/draft-orders/page"

export const config = defineRouteConfig({
  label: "Draft orders",
  nested: "/orders",
  rank: 2,
})

export default MerchantDraftOrdersPage
