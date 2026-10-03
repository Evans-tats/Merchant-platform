import { defineLink } from "@medusajs/framework/utils"
import CartModule from "@medusajs/medusa/cart"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: CartModule.linkable.cart,
    isList: true,
  },
  {
    database: {
      table: "merchant_cart",
      idPrefix: "mercart",
    },
  }
)
