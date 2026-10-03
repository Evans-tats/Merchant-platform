import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantDomain = model
  .define("merchant_domain", {
    id: model.id({ prefix: "merdom" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "domains",
    }),
    hostname: model.text().searchable(),
    type: model.enum(["platform", "custom"]),
    status: model
      .enum(["pending", "verified", "active", "disabled"])
      .default("pending"),
    is_primary: model.boolean().default(false),
    verification_token_hash: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_merchant_domain_hostname_unique",
      on: ["hostname"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_domain_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_domain_primary_unique",
      on: ["merchant_id"],
      unique: true,
      where: 'deleted_at IS NULL AND "is_primary" = true',
    },
  ])

export default MerchantDomain
