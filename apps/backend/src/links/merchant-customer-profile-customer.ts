import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"

import MerchantModule from "../modules/merchant"

export default defineLink(
  {
    linkable: MerchantModule.linkable.merchantCustomerProfile,
    field: "customer_id",
  },
  CustomerModule.linkable.customer,
  {
    readOnly: true,
  }
)
