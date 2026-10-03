import type { MerchantOrder } from "../../../lib/merchant-api"

const normalizedStatus = (status?: string | null) =>
  status?.trim().toLowerCase() || "pending"

export const merchantOrderWorkflowStatus = (order: MerchantOrder) => {
  const orderStatus = normalizedStatus(order.status)

  if (["canceled", "cancelled"].includes(orderStatus)) {
    return "canceled"
  }

  const fulfillmentStatus = normalizedStatus(
    order.fulfillment_status || "not_fulfilled"
  )

  if (!["not_fulfilled", "canceled", "cancelled"].includes(fulfillmentStatus)) {
    return fulfillmentStatus
  }

  return orderStatus
}

export const canCancelMerchantOrder = (order: MerchantOrder) => {
  const orderStatus = normalizedStatus(order.status)

  if (["canceled", "cancelled", "completed"].includes(orderStatus)) {
    return false
  }

  if ((order.fulfillments ?? []).some(({ canceled_at }) => !canceled_at)) {
    return false
  }

  const fulfillmentStatus = normalizedStatus(
    order.fulfillment_status || "not_fulfilled"
  )

  return ["not_fulfilled", "canceled", "cancelled"].includes(
    fulfillmentStatus
  )
}

export const formatOrderWorkflowStatus = (status: string) =>
  status.replace(/_/g, " ")
