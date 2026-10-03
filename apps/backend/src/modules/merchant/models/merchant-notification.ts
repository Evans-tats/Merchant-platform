import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantNotification = model
  .define("merchant_notification", {
    id: model.id({ prefix: "mernot" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "notifications",
    }),
    type: model.text().searchable(),
    severity: model.enum(["info", "warning", "critical"]).default("info"),
    title: model.text(),
    message: model.text(),
    resource_type: model.text().nullable(),
    resource_id: model.text().nullable(),
    read_at: model.dateTime().nullable(),
    metadata: model.json().default({}),
  })
  .indexes([
    {
      name: "IDX_merchant_notification_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_notification_unread",
      on: ["merchant_id", "read_at"],
      where: "deleted_at IS NULL",
    },
  ])

export default MerchantNotification
