import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantCategoriesPage from "../merchant/categories/page"

export const config = defineRouteConfig({
  label: "Categories",
  nested: "/products",
  rank: 3,
})

export default MerchantCategoriesPage
