import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantPaymentConfig = model
  .define("merchant_payment_config", {
    id: model.id({ prefix: "merpay" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "payment_configs",
    }),
    provider: model.enum(["mpesa_stk", "mpesa_paybill"]),
    mode: model.enum(["sandbox", "production"]).default("sandbox"),
    status: model.enum(["disabled", "active"]).default("disabled"),
    public_configuration: model.json().default({}),
    secret_reference: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_merchant_payment_config_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_payment_config_unique",
      on: ["merchant_id", "provider", "mode"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default MerchantPaymentConfig
