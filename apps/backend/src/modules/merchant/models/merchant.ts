import { model } from "@medusajs/framework/utils"

import MerchantCustomerProfile from "./merchant-customer-profile"
import MerchantDomain from "./merchant-domain"
import MerchantInvitation from "./merchant-invitation"
import MerchantActivity from "./merchant-activity"
import MerchantMember from "./merchant-member"
import MerchantNotification from "./merchant-notification"
import MerchantPaymentConfig from "./merchant-payment-config"
import MerchantTheme from "./merchant-theme"

const Merchant = model
  .define("merchant", {
    id: model.id({ prefix: "merch" }).primaryKey(),
    name: model.text().searchable(),
    slug: model.text().searchable(),
    status: model
      .enum(["draft", "active", "suspended"])
      .default("draft"),
    domains: model.hasMany(() => MerchantDomain, {
      mappedBy: "merchant",
    }),
    members: model.hasMany(() => MerchantMember, {
      mappedBy: "merchant",
    }),
    invitations: model.hasMany(() => MerchantInvitation, {
      mappedBy: "merchant",
    }),
    themes: model.hasMany(() => MerchantTheme, {
      mappedBy: "merchant",
    }),
    payment_configs: model.hasMany(() => MerchantPaymentConfig, {
      mappedBy: "merchant",
    }),
    customer_profiles: model.hasMany(() => MerchantCustomerProfile, {
      mappedBy: "merchant",
    }),
    activities: model.hasMany(() => MerchantActivity, {
      mappedBy: "merchant",
    }),
    notifications: model.hasMany(() => MerchantNotification, {
      mappedBy: "merchant",
    }),
  })
  .cascades({
    delete: [
      "domains",
      "members",
      "invitations",
      "themes",
      "payment_configs",
      "customer_profiles",
      "activities",
      "notifications",
    ],
  })
  .indexes([
    {
      name: "IDX_merchant_slug_unique",
      on: ["slug"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default Merchant
