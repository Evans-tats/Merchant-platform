import { defineLink } from "@medusajs/framework/utils"
import OrderModule from "@medusajs/medusa/order"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: OrderModule.linkable.order,
    isList: true,
  },
  {
    database: {
      table: "merchant_order",
      idPrefix: "merord",
    },
  }
)
