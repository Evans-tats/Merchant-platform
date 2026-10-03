import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantCustomersPage from "../merchant/customers/page"

export const config = defineRouteConfig({
  label: "All customers",
  nested: "/customers",
  rank: 1,
})

export default MerchantCustomersPage
