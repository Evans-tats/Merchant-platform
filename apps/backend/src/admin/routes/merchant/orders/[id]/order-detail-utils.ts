import type {
  MerchantOrder,
  MerchantOrderItem,
  MerchantRole,
} from "../../../../lib/merchant-api"

const finiteNumber = (value: unknown): number | undefined => {
  const candidate =
    value && typeof value === "object" && "value" in value
      ? (value as { value?: unknown }).value
      : value

  if (
    (typeof candidate !== "number" && typeof candidate !== "string") ||
    candidate === ""
  ) {
    return undefined
  }

  const number = Number(candidate)

  return Number.isFinite(number) ? number : undefined
}

const validQuantity = (...values: unknown[]): number => {
  for (const value of values) {
    const quantity = finiteNumber(value)

    if (
      quantity !== undefined &&
      Number.isInteger(quantity) &&
      quantity >= 0
    ) {
      return quantity
    }
  }

  return 0
}

export const orderedQuantity = (item: MerchantOrderItem): number =>
  validQuantity(item.quantity, item.raw_quantity)

export const fulfilledQuantity = (item: MerchantOrderItem): number =>
  validQuantity(
    item.detail?.fulfilled_quantity,
    item.detail?.raw_fulfilled_quantity
  )

export const fulfillableQuantity = (item: MerchantOrderItem): number =>
  Math.max(orderedQuantity(item) - fulfilledQuantity(item), 0)

export const canFulfillMerchantOrder = (
  role: MerchantRole,
  items: MerchantOrderItem[] = []
): boolean =>
  (role === "owner" || role === "admin") &&
  items.some((item) => fulfillableQuantity(item) > 0)

export const orderItemTotal = (
  item: MerchantOrderItem
): number | undefined => {
  const total = finiteNumber(item.total)

  if (total !== undefined) {
    return total
  }

  const unitPrice = finiteNumber(item.unit_price)
  const quantity = finiteNumber(item.quantity) ?? finiteNumber(item.raw_quantity)

  if (unitPrice === undefined || quantity === undefined) {
    return undefined
  }

  const fallback = unitPrice * quantity

  return Number.isFinite(fallback) ? fallback : undefined
}

export type OrderCustomerPresentation = {
  name: string
  email: string | null
  phone: string | null
  companyName: string | null
  accountLabel: "Registered customer" | "Guest customer" | "Customer"
}

export const orderCustomerPresentation = (
  order: MerchantOrder
): OrderCustomerPresentation => {
  const customer = order.customer
  const name = [customer?.first_name, customer?.last_name]
    .filter(Boolean)
    .join(" ")
  const email = customer?.email?.trim() || order.email?.trim() || null

  return {
    name:
      name ||
      (customer?.has_account === true ? email || "Customer" : "Guest customer"),
    email,
    phone: customer?.phone?.trim() || null,
    companyName: customer?.company_name?.trim() || null,
    accountLabel:
      customer?.has_account === true
        ? "Registered customer"
        : customer?.has_account === false || !customer
          ? "Guest customer"
          : "Customer",
  }
}
