import { defineLink } from "@medusajs/framework/utils"
import StockLocationModule from "@medusajs/medusa/stock-location"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: StockLocationModule.linkable.stockLocation,
    isList: true,
  },
  {
    database: {
      table: "merchant_stock_location",
      idPrefix: "mersloc",
    },
  }
)
