import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"
import MerchantCustomerAddress from "./merchant-customer-address"

const MerchantCustomerProfile = model
  .define("merchant_customer_profile", {
    id: model.id({ prefix: "mercprof" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "customer_profiles",
    }),
    customer_id: model.text(),
    status: model.enum(["active", "suspended"]).default("active"),
    profile: model.json().default({}),
    preferences: model.json().default({}),
    addresses: model.hasMany(() => MerchantCustomerAddress, {
      mappedBy: "merchant_customer_profile",
    }),
  })
  .cascades({
    delete: ["addresses"],
  })
  .indexes([
    {
      name: "IDX_merchant_customer_profile_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_customer_profile_customer_id",
      on: ["customer_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_customer_profile_unique",
      on: ["merchant_id", "customer_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default MerchantCustomerProfile
