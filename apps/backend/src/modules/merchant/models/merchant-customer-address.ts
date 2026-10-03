import { model } from "@medusajs/framework/utils"

import MerchantCustomerProfile from "./merchant-customer-profile"

const MerchantCustomerAddress = model
  .define("merchant_customer_address", {
    id: model.id({ prefix: "mercaddr" }).primaryKey(),
    merchant_customer_profile: model.belongsTo(
      () => MerchantCustomerProfile,
      {
        mappedBy: "addresses",
      }
    ),
    address_name: model.text().searchable().nullable(),
    is_default_shipping: model.boolean().default(false),
    is_default_billing: model.boolean().default(false),
    company: model.text().searchable().nullable(),
    first_name: model.text().searchable().nullable(),
    last_name: model.text().searchable().nullable(),
    address_1: model.text().searchable().nullable(),
    address_2: model.text().searchable().nullable(),
    city: model.text().searchable().nullable(),
    country_code: model.text().nullable(),
    province: model.text().searchable().nullable(),
    postal_code: model.text().searchable().nullable(),
    phone: model.text().nullable(),
    metadata: model.json().nullable(),
  })
  .indexes([
    {
      name: "IDX_merchant_customer_address_merchant_customer_profile_id",
      on: ["merchant_customer_profile_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_customer_address_default_billing_unique",
      on: ["merchant_customer_profile_id"],
      unique: true,
      where: 'deleted_at IS NULL AND "is_default_billing" = true',
    },
    {
      name: "IDX_merchant_customer_address_default_shipping_unique",
      on: ["merchant_customer_profile_id"],
      unique: true,
      where: 'deleted_at IS NULL AND "is_default_shipping" = true',
    },
  ])

export default MerchantCustomerAddress
