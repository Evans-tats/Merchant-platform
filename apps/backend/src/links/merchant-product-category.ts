import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: ProductModule.linkable.productCategory,
    isList: true,
  },
  {
    database: {
      table: "merchant_product_category",
      idPrefix: "mercat",
    },
  }
)
