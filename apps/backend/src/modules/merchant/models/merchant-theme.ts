import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantTheme = model
  .define("merchant_theme", {
    id: model.id({ prefix: "mertheme" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "themes",
    }),
    version: model.number().default(1),
    configuration: model.json().default({}),
    is_active: model.boolean().default(false),
  })
  .indexes([
    {
      name: "IDX_merchant_theme_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_theme_version_unique",
      on: ["merchant_id", "version"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_theme_active_unique",
      on: ["merchant_id"],
      unique: true,
      where: 'deleted_at IS NULL AND "is_active" = true',
    },
  ])

export default MerchantTheme
