import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantMember = model
  .define("merchant_member", {
    id: model.id({ prefix: "mermem" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "members",
    }),
    actor_id: model.text(),
    role: model.enum(["owner", "admin", "staff"]),
    status: model
      .enum(["invited", "active", "suspended"])
      .default("invited"),
  })
  .indexes([
    {
      name: "IDX_merchant_member_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_member_actor_id",
      on: ["actor_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_member_unique",
      on: ["merchant_id", "actor_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default MerchantMember
