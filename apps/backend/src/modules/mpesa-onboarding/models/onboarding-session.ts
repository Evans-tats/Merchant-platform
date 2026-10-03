import { model } from "@medusajs/framework/utils"

const OnboardingSession = model
  .define("mpesa_onboarding_session", {
    id: model.id({ prefix: "mponb" }).primaryKey(),
    msisdn: model.text(),
    channel: model.enum(["cli", "whatsapp", "business_hub"]),
    status: model.enum(["active", "locked", "completed"]).default("active"),
    step: model
      .enum([
        "language",
        "terms",
        "account_type",
        "account_number",
        "otp",
        "store_name",
        "category",
        "products",
        "review",
        "completed",
      ])
      .default("language"),
    language: model.enum(["en", "sw"]).default("en"),
    answers: model.json().default({}),
    account_type: model.enum(["till", "paybill", "pochi"]).nullable(),
    account_number: model.text().nullable(),
    registered_name: model.text().nullable(),
    verified_at: model.dateTime().nullable(),
    otp_hash: model.text().nullable(),
    otp_expires_at: model.dateTime().nullable(),
    otp_attempts: model.number().default(0),
    lookup_attempts: model.number().default(0),
    locked_until: model.dateTime().nullable(),
    merchant_id: model.text().nullable(),
  })
  .indexes([
    {
      name: "IDX_mpesa_onboarding_session_msisdn",
      on: ["msisdn", "status"],
      where: "deleted_at IS NULL",
    },
  ])

export default OnboardingSession
