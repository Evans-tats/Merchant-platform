import { defineLink } from "@medusajs/framework/utils"
import UserModule from "@medusajs/medusa/user"

import MerchantModule from "../modules/merchant"

export default defineLink(
  {
    linkable: MerchantModule.linkable.merchantMember,
    field: "actor_id",
  },
  UserModule.linkable.user,
  {
    readOnly: true,
  }
)
