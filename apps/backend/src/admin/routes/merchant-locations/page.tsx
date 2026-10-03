import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantInventoryPage from "../merchant/inventory/page"

export const config = defineRouteConfig({
  label: "Locations",
  nested: "/inventory",
  rank: 2,
})

export default MerchantInventoryPage
