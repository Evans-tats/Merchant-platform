import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"

import MerchantModule from "../modules/merchant"

export default defineLink(
  {
    linkable: CustomerModule.linkable.customer,
    field: "id",
    isList: true,
  },
  {
    ...MerchantModule.linkable.merchantCustomerProfile.id,
    primaryKey: "customer_id",
  },
  {
    readOnly: true,
  }
)
