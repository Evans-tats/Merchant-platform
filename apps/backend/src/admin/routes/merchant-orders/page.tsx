import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantOrdersPage from "../merchant/orders/page"

export const config = defineRouteConfig({
  label: "All orders",
  nested: "/orders",
  rank: 1,
})

export default MerchantOrdersPage
