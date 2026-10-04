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

type MerchantPayment = NonNullable<
  NonNullable<MerchantOrder["payment_collections"]>[number]["payments"]
>[number]

export type MerchantPaymentState = "paid" | "to_confirm" | "canceled"

// A manual payment, such as cash on delivery or M-Pesa sent by hand, is
// authorized at checkout and only counts as paid once the merchant confirms
// the money arrived ("Mark as paid", which captures it).
export const merchantPaymentState = (
  payment: MerchantPayment
): MerchantPaymentState => {
  if (payment.canceled_at) {
    return "canceled"
  }

  return payment.captured_at ? "paid" : "to_confirm"
}

// The amount still to confirm, after any part captured earlier.
export const amountToConfirm = (payment: MerchantPayment) => {
  const captured = (payment.captures ?? []).reduce(
    (sum, capture) => sum + Number(capture?.amount ?? 0),
    0
  )

  return Math.max(0, Math.round((Number(payment.amount) - captured) * 100) / 100)
}
