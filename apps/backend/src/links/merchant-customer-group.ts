import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"

import MerchantModule from "../modules/merchant"

export default defineLink(
  MerchantModule.linkable.merchant,
  {
    linkable: CustomerModule.linkable.customerGroup,
    isList: true,
  },
  {
    database: {
      table: "merchant_customer_group",
      idPrefix: "mercgrp",
    },
  }
)
