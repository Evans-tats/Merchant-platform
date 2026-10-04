import { defineLink } from "@medusajs/framework/utils"
import PromotionModule from "@medusajs/medusa/promotion"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: PromotionModule.linkable.promotion,
    isList: true,
  },
  {
    database: {
      table: "merchant_promotion",
      idPrefix: "mercpromo",
    },
  }
)
