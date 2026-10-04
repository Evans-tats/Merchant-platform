import { defineRouteConfig } from "@medusajs/admin-sdk"

import MerchantCampaignsPage from "../merchant/campaigns/page"

export const config = defineRouteConfig({
  label: "Campaigns",
  nested: "/promotions",
  rank: 2,
})

export default MerchantCampaignsPage
