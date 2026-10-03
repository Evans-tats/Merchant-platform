import { defineLink } from "@medusajs/framework/utils"
import SalesChannelModule from "@medusajs/medusa/sales-channel"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: SalesChannelModule.linkable.salesChannel,
    alias: "primary_sales_channel",
  },
  {
    database: {
      table: "merchant_sales_channel",
      idPrefix: "mersc",
    },
  }
)
