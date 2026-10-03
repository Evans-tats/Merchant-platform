import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  InviteWorkflowEvents,
} from "@medusajs/framework/utils"

import { MERCHANT_MODULE } from "../modules/merchant"
import MerchantModuleService from "../modules/merchant/service"

type InviteAcceptedEvent = {
  id: string
}

type MerchantInvitationGraph = {
  id: string
  email: string
  role: "admin" | "staff"
  status: "pending" | "accepted" | "revoked"
  merchant_id: string
}

type UserGraph = {
  id: string
  email: string
}

export default async function activateInvitedMerchantMember({
  event: { data },
  container,
}: SubscriberArgs<InviteAcceptedEvent>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: invitationData } = await query.graph({
    entity: "merchant_invitation",
    fields: ["id", "email", "role", "status", "merchant_id"],
    filters: { invite_id: data.id },
  })
  const invitation = (
    invitationData as unknown as MerchantInvitationGraph[]
  )[0]

  if (!invitation || invitation.status !== "pending") {
    return
  }

  const { data: userData } = await query.graph({
    entity: "user",
    fields: ["id", "email"],
    filters: { email: invitation.email },
  })
  const user = (userData as unknown as UserGraph[])[0]

  if (!user) {
    return
  }

  const merchantService =
    container.resolve<MerchantModuleService>(MERCHANT_MODULE)
  const existingMembers = await merchantService.listMerchantMembers({
    merchant_id: invitation.merchant_id,
    actor_id: user.id,
  })

  if (!existingMembers.length) {
    await merchantService.createMerchantMembers({
      merchant_id: invitation.merchant_id,
      actor_id: user.id,
      role: invitation.role,
      status: "active",
    })
  }

  await merchantService.updateMerchantInvitations({
    id: invitation.id,
    status: "accepted",
  })
}

export const config: SubscriberConfig = {
  event: InviteWorkflowEvents.ACCEPTED,
}
