import { model } from "@medusajs/framework/utils"

// A verified M-PESA account and the store it was used to create. The unique
// index guarantees one Till, Paybill, or Pochi la Biashara per store.
const MpesaAccountClaim = model
  .define("mpesa_account_claim", {
    id: model.id({ prefix: "mpclm" }).primaryKey(),
    account_type: model.enum(["till", "paybill", "pochi"]),
    account_number: model.text(),
    registered_name: model.text(),
    store_name: model.text(),
    owner_msisdn: model.text(),
    session_id: model.text(),
    verified_at: model.dateTime(),
  })
  .indexes([
    {
      name: "IDX_mpesa_account_claim_unique",
      on: ["account_type", "account_number"],
      unique: true,
      where: "deleted_at IS NULL",
    },
  ])

export default MpesaAccountClaim
