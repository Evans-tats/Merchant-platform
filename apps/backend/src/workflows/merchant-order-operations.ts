import type {
  HttpTypes,
  OrderWorkflow,
} from "@medusajs/framework/types"
import {
  ContainerRegistrationKeys,
  MathBN,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import {
  cancelOrderWorkflow,
  beginExchangeOrderWorkflow,
  capturePaymentWorkflow,
  createAndCompleteReturnOrderWorkflow,
  createOrderFulfillmentWorkflow,
  createOrderShipmentWorkflow,
  markOrderFulfillmentAsDeliveredWorkflow,
  refundPaymentWorkflow,
} from "@medusajs/medusa/core-flows"

import {
  assertMerchantOwns,
  resolveStaffMerchant,
  type ResolvedMerchantId,
} from "../services/tenant-resolution"
import {
  type MerchantScopeInput,
  validateMerchantResourceStep,
  validateMerchantScopeStep,
} from "./steps/validate-merchant-commerce"

type CancelMerchantOrderInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
}

type FulfillMerchantOrderInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
  fulfillment: Omit<
    HttpTypes.AdminCreateOrderFulfillment,
    "items" | "location_id"
  > & {
    items: Array<{ id: string; quantity: number }>
    location_id: string
  }
}

type ListMerchantOrderFulfillmentOptionsInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
}

type RefundMerchantPaymentInput = MerchantScopeInput & {
  order_id: string
  payment_id: string
  actor_id: string
  refund: HttpTypes.AdminRefundPayment
}

type CaptureMerchantPaymentInput = MerchantScopeInput & {
  order_id: string
  payment_id: string
  actor_id: string
}

type ShipMerchantOrderInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
  shipment: Omit<OrderWorkflow.CreateOrderShipmentWorkflowInput, "order_id">
}

type DeliverMerchantOrderInput = MerchantScopeInput & {
  order_id: string
  fulfillment_id: string
  actor_id: string
  no_notification?: boolean
}

type ReturnMerchantOrderInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
  return: Omit<OrderWorkflow.CreateOrderReturnWorkflowInput, "order_id">
}

type AddMerchantOrderNoteInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
  note: string
}

type BeginMerchantOrderExchangeInput = MerchantScopeInput & {
  order_id: string
  actor_id: string
  description?: string
  internal_note?: string
}

type PaymentGraph = {
  id: string
  payment_collection?: {
    order?: { id: string } | null
  } | null
}

type OrderFulfillmentGraph = {
  id: string
  fulfillments?: Array<{
    id: string
    shipped_at?: Date | string | null
    delivered_at?: Date | string | null
    canceled_at?: Date | string | null
  }>
  metadata?: Record<string, unknown> | null
}

type FulfillmentOrderGraph = {
  id: string
  shipping_methods?: Array<{ shipping_option_id?: string | null }>
  items?: Array<{
    id: string
    quantity: number
    detail?: { fulfilled_quantity?: number | null } | null
  }>
}

type MerchantFulfillmentLocationsGraph = {
  stock_locations?: Array<{
    id: string
    name: string
    address?: Record<string, unknown> | null
  }>
}

type ShippingOptionLocationGraph = {
  service_zone?: {
    fulfillment_set?: {
      location?: { id: string } | null
    } | null
  } | null
}

const validateMerchantFulfillmentAccessStep = createStep(
  "validate-merchant-fulfillment-access",
  async (
    input: {
      merchant_id: string
      sales_channel_id: string
      actor_id: string
    },
    { container }
  ) => {
    const context = await resolveStaffMerchant(
      container,
      input.actor_id,
      input.merchant_id,
      { allowed_roles: ["owner", "admin"] }
    )

    if (context.salesChannel.id !== input.sales_channel_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Merchant commerce scope not found"
      )
    }

    return new StepResponse({
      merchant_id: context.merchant.id,
      sales_channel_id: context.salesChannel.id,
    })
  }
)

const validateMerchantOptionalLocationStep = createStep(
  "validate-merchant-optional-location",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      location_id?: string | null
    },
    { container }
  ) => {
    if (input.location_id) {
      await assertMerchantOwns(
        container,
        "stock_location",
        input.location_id,
        input.merchant_id
      )
    }

    return new StepResponse(input)
  }
)

const validateMerchantFulfillmentRequestStep = createStep(
  "validate-merchant-fulfillment-request",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      order_id: string
      location_id: string
      items: Array<{ id: string; quantity: number }>
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id
    )
    await assertMerchantOwns(
      container,
      "stock_location",
      input.location_id,
      input.merchant_id
    )

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "items.id",
        "items.quantity",
        "items.detail.fulfilled_quantity",
      ],
      filters: { id: input.order_id },
    })
    const order = (data as unknown as FulfillmentOrderGraph[])[0]
    const orderItems = new Map(
      (order?.items ?? []).map((item) => [item.id, item])
    )
    const submittedIds = new Set<string>()

    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
    }

    for (const item of input.items) {
      if (submittedIds.has(item.id)) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Order item ${item.id} was submitted more than once`
        )
      }

      submittedIds.add(item.id)
      const orderItem = orderItems.get(item.id)

      if (!orderItem) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Order item ${item.id} does not belong to this order`
        )
      }

      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Fulfillment quantity for item ${item.id} must be a positive integer`
        )
      }

      const fulfilledQuantity = Number(
        orderItem.detail?.fulfilled_quantity ?? 0
      )
      const remainingQuantity = Math.max(
        Number(orderItem.quantity) - fulfilledQuantity,
        0
      )

      if (remainingQuantity === 0) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Order item ${item.id} is already fully fulfilled`
        )
      }

      if (item.quantity > remainingQuantity) {
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          `Fulfillment quantity for item ${item.id} exceeds the remaining quantity of ${remainingQuantity}`
        )
      }
    }

    return new StepResponse(input)
  }
)

const listMerchantOrderFulfillmentOptionsStep = createStep(
  "list-merchant-order-fulfillment-options",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      order_id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id
    )

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const [{ data: merchantData }, { data: orderData }] = await Promise.all([
      query.graph({
        entity: "merchant",
        fields: [
          "stock_locations.id",
          "stock_locations.name",
          "stock_locations.address.*",
        ],
        filters: { id: input.merchant_id },
      }),
      query.graph({
        entity: "order",
        fields: ["id", "shipping_methods.shipping_option_id"],
        filters: { id: input.order_id },
      }),
    ])
    const merchant = (
      merchantData as unknown as MerchantFulfillmentLocationsGraph[]
    )[0]
    const order = (orderData as unknown as FulfillmentOrderGraph[])[0]
    const locations = merchant?.stock_locations ?? []
    const shippingOptionId = order?.shipping_methods?.find(
      ({ shipping_option_id }) => Boolean(shipping_option_id)
    )?.shipping_option_id
    let defaultLocationId: string | undefined

    if (shippingOptionId) {
      const { data: shippingOptionData } = await query.graph({
        entity: "shipping_option",
        fields: ["service_zone.fulfillment_set.location.id"],
        filters: { id: shippingOptionId },
      })
      const shippingOption = (
        shippingOptionData as unknown as ShippingOptionLocationGraph[]
      )[0]
      const linkedLocationId =
        shippingOption?.service_zone?.fulfillment_set?.location?.id

      if (locations.some(({ id }) => id === linkedLocationId)) {
        defaultLocationId = linkedLocationId
      }
    }

    if (!defaultLocationId && locations.length === 1) {
      defaultLocationId = locations[0].id
    }

    return new StepResponse({
      stock_locations: locations,
      default_location_id: defaultLocationId,
    })
  }
)

const validateMerchantPaymentStep = createStep(
  "validate-merchant-payment",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      order_id: string
      payment_id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id
    )

    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "payment",
      fields: ["id", "payment_collection.order.id"],
      filters: { id: input.payment_id },
    })
    const payment = (data as unknown as PaymentGraph[])[0]

    if (payment?.payment_collection?.order?.id !== input.order_id) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "payment not found"
      )
    }

    return new StepResponse(input)
  }
)

type CapturablePaymentGraph = {
  id: string
  amount: number
  captured_at?: Date | string | null
  canceled_at?: Date | string | null
  captures?: Array<{ amount: number } | null> | null
  payment_collection?: { order?: { display_id?: number | null } | null } | null
}

// What is left to capture on a payment. A manual payment, such as cash on
// delivery or M-Pesa sent by hand, is authorized at checkout and captured
// once the merchant confirms the money arrived.
const resolveMerchantPaymentCaptureStep = createStep(
  "resolve-merchant-payment-capture",
  async (input: { payment_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "payment",
      fields: [
        "id",
        "amount",
        "captured_at",
        "canceled_at",
        "captures.amount",
        "payment_collection.order.display_id",
      ],
      filters: { id: input.payment_id },
    })
    const payment = (data as unknown as CapturablePaymentGraph[])[0]

    if (!payment) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "payment not found")
    }

    if (payment.canceled_at) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This payment was canceled, so it can't be marked as paid"
      )
    }

    const captures = (payment.captures ?? []).filter(
      (capture): capture is { amount: number } => Boolean(capture)
    )
    const remaining = MathBN.sub(
      payment.amount,
      MathBN.add(0, ...captures.map(({ amount }) => amount))
    )

    if (payment.captured_at || MathBN.lte(remaining, 0)) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This payment is already marked as paid"
      )
    }

    // Without an amount Medusa captures the whole payment, so the amount is
    // only given when part of it was captured before.
    return new StepResponse({
      payment_id: payment.id,
      amount: captures.length ? remaining.toNumber() : undefined,
      order_number: payment.payment_collection?.order?.display_id ?? null,
    })
  }
)

const validateMerchantShipmentStep = createStep(
  "validate-merchant-shipment",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      order_id: string
      fulfillment_id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "fulfillments.id"],
      filters: { id: input.order_id },
    })
    const order = (data as unknown as OrderFulfillmentGraph[])[0]

    if (
      !order?.fulfillments?.some(
        ({ id }) => id === input.fulfillment_id
      )
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Fulfillment not found"
      )
    }

    return new StepResponse(input)
  }
)

const validateMerchantDeliveryStep = createStep(
  "validate-merchant-delivery",
  async (
    input: {
      merchant_id: ResolvedMerchantId
      order_id: string
      fulfillment_id: string
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "fulfillments.id",
        "fulfillments.shipped_at",
        "fulfillments.delivered_at",
        "fulfillments.canceled_at",
      ],
      filters: { id: input.order_id },
    })
    const order = (data as unknown as OrderFulfillmentGraph[])[0]
    const fulfillment = order?.fulfillments?.find(
      ({ id }) => id === input.fulfillment_id
    )

    if (!fulfillment) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Fulfillment not found"
      )
    }

    if (fulfillment.canceled_at) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A canceled fulfillment cannot be marked as delivered"
      )
    }

    if (fulfillment.delivered_at) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Fulfillment has already been delivered"
      )
    }

    if (!fulfillment.shipped_at) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "Fulfillment must be shipped before it can be marked as delivered"
      )
    }

    return new StepResponse(input)
  }
)

const addMerchantOrderNoteStep = createStep(
  "add-merchant-order-note",
  async (
    input: Omit<AddMerchantOrderNoteInput, "merchant_id" | "sales_channel_id"> & {
      merchant_id: ResolvedMerchantId
    },
    { container }
  ) => {
    await assertMerchantOwns(
      container,
      "order",
      input.order_id,
      input.merchant_id
    )
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "order",
      fields: ["id", "metadata"],
      filters: { id: input.order_id },
    })
    const order = (data as unknown as OrderFulfillmentGraph[])[0]

    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
    }

    const orderService = container.resolve(Modules.ORDER)
    const existingNotes = Array.isArray(order.metadata?.merchant_notes)
      ? order.metadata.merchant_notes
      : []
    const metadata = {
      ...(order.metadata ?? {}),
      merchant_notes: [
        ...existingNotes,
        {
          id: `note_${Date.now()}`,
          note: input.note,
          actor_id: input.actor_id,
          created_at: new Date().toISOString(),
        },
      ],
    }
    const updated = await orderService.updateOrders([
      {
        id: input.order_id,
        metadata,
      },
    ])

    return new StepResponse(updated[0], [
      {
        id: input.order_id,
        metadata: order.metadata ?? {},
      },
    ])
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }

    const orderService = container.resolve(Modules.ORDER)
    await orderService.updateOrders(previous)
  }
)

export const cancelMerchantOrderWorkflow = createWorkflow(
  "cancel-merchant-order",
  function (input: CancelMerchantOrderInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantResourceStep({
      scope,
      resource_type: "order",
      resource_id: input.order_id,
    })
    cancelOrderWorkflow.runAsStep({
      input: {
        order_id: input.order_id,
        canceled_by: input.actor_id,
      },
    })

    return new WorkflowResponse({ id: input.order_id })
  }
)

export const fulfillMerchantOrderWorkflow = createWorkflow(
  "fulfill-merchant-order",
  function (input: FulfillMerchantOrderInput) {
    const access = validateMerchantFulfillmentAccessStep({
      merchant_id: input.merchant_id,
      sales_channel_id: input.sales_channel_id,
      actor_id: input.actor_id,
    })
    const validated = validateMerchantFulfillmentRequestStep({
      merchant_id: access.merchant_id,
      order_id: input.order_id,
      location_id: input.fulfillment.location_id,
      items: input.fulfillment.items,
    })
    const fulfillmentInput = transform(
      { input, validated },
      ({ input }) => ({
        ...input.fulfillment,
        order_id: input.order_id,
        created_by: input.actor_id,
      }) as OrderWorkflow.CreateOrderFulfillmentWorkflowInput
    )
    const fulfillment = createOrderFulfillmentWorkflow.runAsStep({
      input: fulfillmentInput,
    })

    return new WorkflowResponse(fulfillment)
  }
)

export const listMerchantOrderFulfillmentOptionsWorkflow = createWorkflow(
  "list-merchant-order-fulfillment-options",
  function (input: ListMerchantOrderFulfillmentOptionsInput) {
    const access = validateMerchantFulfillmentAccessStep({
      merchant_id: input.merchant_id,
      sales_channel_id: input.sales_channel_id,
      actor_id: input.actor_id,
    })
    const options = listMerchantOrderFulfillmentOptionsStep({
      merchant_id: access.merchant_id,
      order_id: input.order_id,
    })

    return new WorkflowResponse(options)
  }
)

export const refundMerchantPaymentWorkflow = createWorkflow(
  "refund-merchant-payment",
  function (input: RefundMerchantPaymentInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantPaymentStep({
      merchant_id: scope.merchant_id,
      order_id: input.order_id,
      payment_id: input.payment_id,
    })
    const refundInput = transform({ input }, ({ input }) => ({
      ...input.refund,
      payment_id: input.payment_id,
      created_by: input.actor_id,
    }))
    const refund = refundPaymentWorkflow.runAsStep({
      input: refundInput,
    })

    return new WorkflowResponse(refund)
  }
)

// Marks an order's payment as paid by capturing what is left of it, the same
// step Medusa's own admin runs from its "Capture payment" button.
export const captureMerchantPaymentWorkflow = createWorkflow(
  "capture-merchant-payment",
  function (input: CaptureMerchantPaymentInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantPaymentStep({
      merchant_id: scope.merchant_id,
      order_id: input.order_id,
      payment_id: input.payment_id,
    })
    const capture = resolveMerchantPaymentCaptureStep({
      payment_id: input.payment_id,
    })
    const captureInput = transform({ input, capture }, ({ input, capture }) => ({
      payment_id: capture.payment_id,
      amount: capture.amount,
      captured_by: input.actor_id,
    }))
    const payment = capturePaymentWorkflow.runAsStep({ input: captureInput })
    const result = transform({ payment, capture }, ({ payment, capture }) => ({
      payment,
      order_number: capture.order_number,
    }))

    return new WorkflowResponse(result)
  }
)

export const shipMerchantOrderWorkflow = createWorkflow(
  "ship-merchant-order",
  function (input: ShipMerchantOrderInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantShipmentStep({
      merchant_id: scope.merchant_id,
      order_id: input.order_id,
      fulfillment_id: input.shipment.fulfillment_id,
    })
    const shipmentInput = transform({ input }, ({ input }) => ({
      ...input.shipment,
      order_id: input.order_id,
      created_by: input.actor_id,
    }))
    const shipment = createOrderShipmentWorkflow.runAsStep({
      input: shipmentInput,
    })

    return new WorkflowResponse(shipment)
  }
)

export const deliverMerchantOrderWorkflow = createWorkflow(
  "deliver-merchant-order",
  function (input: DeliverMerchantOrderInput) {
    const access = validateMerchantFulfillmentAccessStep({
      merchant_id: input.merchant_id,
      sales_channel_id: input.sales_channel_id,
      actor_id: input.actor_id,
    })
    const validated = validateMerchantDeliveryStep({
      merchant_id: access.merchant_id,
      order_id: input.order_id,
      fulfillment_id: input.fulfillment_id,
    })
    const delivery = markOrderFulfillmentAsDeliveredWorkflow.runAsStep({
      input: {
        orderId: validated.order_id,
        fulfillmentId: validated.fulfillment_id,
        no_notification: input.no_notification,
      },
    })

    return new WorkflowResponse(delivery)
  }
)

export const returnMerchantOrderWorkflow = createWorkflow(
  "return-merchant-order",
  function (input: ReturnMerchantOrderInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantResourceStep({
      scope,
      resource_type: "order",
      resource_id: input.order_id,
    })
    validateMerchantOptionalLocationStep({
      merchant_id: scope.merchant_id,
      location_id: input.return.location_id,
    })
    const returnInput = transform({ input }, ({ input }) => ({
      ...input.return,
      order_id: input.order_id,
      created_by: input.actor_id,
    }))
    const result = createAndCompleteReturnOrderWorkflow.runAsStep({
      input: returnInput,
    })

    return new WorkflowResponse(result)
  }
)

export const addMerchantOrderNoteWorkflow = createWorkflow(
  "add-merchant-order-note",
  function (input: AddMerchantOrderNoteInput) {
    const scope = validateMerchantScopeStep(input)
    const order = addMerchantOrderNoteStep({
      merchant_id: scope.merchant_id,
      order_id: input.order_id,
      actor_id: input.actor_id,
      note: input.note,
    })

    return new WorkflowResponse(order)
  }
)

export const beginMerchantOrderExchangeWorkflow = createWorkflow(
  "begin-merchant-order-exchange",
  function (input: BeginMerchantOrderExchangeInput) {
    const scope = validateMerchantScopeStep(input)

    validateMerchantResourceStep({
      scope,
      resource_type: "order",
      resource_id: input.order_id,
    })
    const exchange = beginExchangeOrderWorkflow.runAsStep({
      input: {
        order_id: input.order_id,
        created_by: input.actor_id,
        description: input.description,
        internal_note: input.internal_note,
        metadata: { merchant_id: scope.merchant_id },
      },
    })

    return new WorkflowResponse(exchange)
  }
)
