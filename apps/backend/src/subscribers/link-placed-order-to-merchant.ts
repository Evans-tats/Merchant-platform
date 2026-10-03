import type {
  SubscriberArgs,
  SubscriberConfig,
} from "@medusajs/framework"
import {
  ContainerRegistrationKeys,
  Modules,
  OrderWorkflowEvents,
} from "@medusajs/framework/utils"

import { MERCHANT_MODULE } from "../modules/merchant"
import MerchantModuleService from "../modules/merchant/service"

type PlacedOrderEvent = {
  id: string
}

type OrderGraph = {
  id: string
  display_id?: number | string
  total?: number
  currency_code?: string
  sales_channel_id?: string | null
  items?: Array<{
    variant?: {
      product?: {
        id: string
        merchant?: { id: string } | null
        sales_channels?: Array<{ id: string }>
      } | null
    } | null
  }>
}

type SalesChannelGraph = {
  merchant?: {
    id: string
    status: string
  } | null
}

export default async function linkPlacedOrderToMerchant({
  event: { data },
  container,
}: SubscriberArgs<PlacedOrderEvent>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const { data: orderData } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "total",
      "currency_code",
      "sales_channel_id",
      "items.variant.product.id",
      "items.variant.product.merchant.id",
      "items.variant.product.sales_channels.id",
    ],
    filters: { id: data.id },
  })
  const order = (orderData as unknown as OrderGraph[])[0]

  if (!order?.sales_channel_id) {
    return
  }

  const { data: salesChannelData } = await query.graph({
    entity: "sales_channel",
    fields: ["merchant.id", "merchant.status"],
    filters: { id: order.sales_channel_id },
  })
  const salesChannel = (
    salesChannelData as unknown as SalesChannelGraph[]
  )[0]
  const merchant = salesChannel?.merchant

  if (!merchant || merchant.status !== "active") {
    return
  }

  const hasInvalidItem = (order.items ?? []).some(({ variant }) => {
    const product = variant?.product

    return (
      !product ||
      product.merchant?.id !== merchant.id ||
      !product.sales_channels?.some(
        ({ id }) => id === order.sales_channel_id
      )
    )
  })

  if (hasInvalidItem) {
    return
  }

  await link.create({
    [MERCHANT_MODULE]: { merchant_id: merchant.id },
    [Modules.ORDER]: { order_id: order.id },
  })

  const merchantService =
    container.resolve<MerchantModuleService>(MERCHANT_MODULE)
  const orderLabel = order.display_id ? `#${order.display_id}` : order.id

  await Promise.all([
    merchantService.createMerchantActivities({
      merchant_id: merchant.id,
      actor_id: null,
      action: "order.placed",
      resource_type: "order",
      resource_id: order.id,
      description: `Order ${orderLabel} was placed`,
      metadata: {
        total: order.total ?? null,
        currency_code: order.currency_code ?? null,
      },
    }),
    merchantService.createMerchantNotifications({
      merchant_id: merchant.id,
      type: "order.placed",
      severity: "info",
      title: "New order",
      message: `Order ${orderLabel} is ready for review`,
      resource_type: "order",
      resource_id: order.id,
      metadata: {
        total: order.total ?? null,
        currency_code: order.currency_code ?? null,
      },
    }),
  ])
}

export const config: SubscriberConfig = {
  event: OrderWorkflowEvents.PLACED,
}
