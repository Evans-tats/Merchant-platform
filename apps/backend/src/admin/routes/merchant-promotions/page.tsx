import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantPromotionsPage from "../merchant/promotions/page"

export const config = defineRouteConfig({
  label: "All promotions",
  nested: "/promotions",
  rank: 1,
})

export default MerchantPromotionsPage
