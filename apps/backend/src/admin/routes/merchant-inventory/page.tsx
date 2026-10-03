import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantInventoryPage from "../merchant/inventory/page"

export const config = defineRouteConfig({
  label: "Stock",
  nested: "/inventory",
  rank: 1,
})

export default MerchantInventoryPage
