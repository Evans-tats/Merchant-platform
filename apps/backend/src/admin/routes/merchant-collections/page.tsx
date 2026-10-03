import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantCollectionsPage from "../merchant/collections/page"

export const config = defineRouteConfig({
  label: "Collections",
  nested: "/products",
  rank: 2,
})

export default MerchantCollectionsPage
