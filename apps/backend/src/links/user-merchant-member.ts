import { defineLink } from "@medusajs/framework/utils"
import UserModule from "@medusajs/medusa/user"

import MerchantModule from "../modules/merchant"

export default defineLink(
  {
    linkable: UserModule.linkable.user,
    field: "id",
    isList: true,
  },
  {
    ...MerchantModule.linkable.merchantMember.id,
    primaryKey: "actor_id",
  },
  {
    readOnly: true,
  }
)
