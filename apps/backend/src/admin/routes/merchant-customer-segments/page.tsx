import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantCustomerSegmentsPage from "../merchant/customer-segments/page"

export const config = defineRouteConfig({
  label: "Customer segments",
  nested: "/customers",
  rank: 2,
})

export default MerchantCustomerSegmentsPage
