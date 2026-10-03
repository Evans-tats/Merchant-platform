import { model } from "@medusajs/framework/utils"

import Merchant from "./merchant"

const MerchantInvitation = model
  .define("merchant_invitation", {
    id: model.id({ prefix: "merinv" }).primaryKey(),
    merchant: model.belongsTo(() => Merchant, {
      mappedBy: "invitations",
    }),
    invite_id: model.text(),
    email: model.text().searchable(),
    role: model.enum(["admin", "staff"]),
    status: model
      .enum(["pending", "accepted", "revoked"])
      .default("pending"),
    invited_by_actor_id: model.text(),
  })
  .indexes([
    {
      name: "IDX_merchant_invitation_merchant_id",
      on: ["merchant_id"],
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_invitation_invite_id_unique",
      on: ["invite_id"],
      unique: true,
      where: "deleted_at IS NULL",
    },
    {
      name: "IDX_merchant_invitation_pending_email_unique",
      on: ["merchant_id", "email"],
      unique: true,
      where: "deleted_at IS NULL AND status = 'pending'",
    },
  ])

export default MerchantInvitation
