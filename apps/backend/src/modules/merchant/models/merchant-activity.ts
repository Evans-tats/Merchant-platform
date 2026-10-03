import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantActivity = model
  .define("merchant_activity", {
    id: model.id({ prefix: "meract" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "activities",
    }),
    actor_id: model.text().nullable(),
    action: model.text().searchable(),
    resource_type: model.text().searchable(),
    resource_id: model.text().nullable(),
    description: model.text(),
    metadata: model.json().default({}),
  })
  .indexes([
    {
      name: "IDX_merchant_activity_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_activity_resource",
      on: ["merchant_id", "resource_type", "resource_id"],
      where: "deleted_at IS NULL",
    },
  ])

export default MerchantActivity
