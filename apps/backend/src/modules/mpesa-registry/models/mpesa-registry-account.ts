import { model } from "@medusajs/framework/utils"

// Mock of the M-PESA business registry. In production this data lives with
// M-PESA and is reached through an API; the platform never stores it.
const MpesaRegistryAccount = model
  .define("mpesa_registry_account", {
    id: model.id({ prefix: "mpreg" }).primaryKey(),
    account_type: model.enum(["till", "paybill", "pochi"]),
    account_number: model.text(),
    registered_name: model.text(),
    owner_msisdn: model.text(),
    kyc_status: model
      .enum(["verified", "pending", "suspended"])
      .default("verified"),
  })
  .indexes([
    {
      name: "IDX_mpesa_registry_account_unique",
      on: ["account_type", "account_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default MpesaRegistryAccount
