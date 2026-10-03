import { defineLink } from "@medusajs/framework/utils"
import FulfillmentModule from "@medusajs/medusa/fulfillment"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: FulfillmentModule.linkable.shippingProfile,
    isList: true,
  },
  {
    database: {
      table: "merchant_shipping_profile",
      idPrefix: "mershp",
    },
  }
)
