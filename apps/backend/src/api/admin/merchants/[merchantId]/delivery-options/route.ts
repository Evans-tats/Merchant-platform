import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  createMerchantDeliveryMethodWorkflow,
  listMerchantDeliveryMethodsWorkflow,
  type MerchantDeliveryMethodInput,
} from "../../../../../workflows/merchant-delivery"
import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../utils/merchant-request-context"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type CreateDeliveryMethodBody = Omit<
  MerchantDeliveryMethodInput,
  "merchant_id" | "sales_channel_id"
>

export const GET = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantDeliveryMethodsWorkflow(
    request.scope
  ).run({
    input: getMerchantRouteScope(request),
  })

  response.status(200).json(result)
}

export const POST = async (
  request: MedusaRequest<CreateDeliveryMethodBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await createMerchantDeliveryMethodWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      ...request.validatedBody,
    },
  })
  const deliveryOption = result[0]

  await recordMerchantActivity(request, {
    action: "delivery_method.created",
    resource_type: "shipping_option",
    resource_id: deliveryOption.id,
    description: `Created delivery method ${request.validatedBody.name}`,
  })

  response.status(201).json({ delivery_option: deliveryOption })
}
