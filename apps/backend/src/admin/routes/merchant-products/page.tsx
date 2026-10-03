import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantProductsPage from "../merchant/products/page"

export const config = defineRouteConfig({
  label: "All products",
  nested: "/products",
  rank: 1,
})

export default MerchantProductsPage
