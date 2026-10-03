import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import {
  type MerchantDeliveryMethodInput,
  updateMerchantDeliveryMethodWorkflow,
} from "../../../../../../workflows/merchant-delivery"
import { getMerchantRouteScope } from "../../../../../utils/merchant-route-scope"
import { requireMerchantRole } from "../../../../../utils/merchant-request-context"
import { recordMerchantActivity } from "../../../../../utils/record-merchant-activity"

type UpdateDeliveryMethodBody = Omit<
  MerchantDeliveryMethodInput,
  "merchant_id" | "sales_channel_id"
>

export const POST = async (
  request: MedusaRequest<UpdateDeliveryMethodBody>,
  response: MedusaResponse
) => {
  requireMerchantRole(request, ["owner", "admin"])
  const { result } = await updateMerchantDeliveryMethodWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      ...request.validatedBody,
      delivery_option_id: request.params.deliveryOptionId,
    },
  })

  await recordMerchantActivity(request, {
    action: "delivery_method.updated",
    resource_type: "shipping_option",
    resource_id: request.params.deliveryOptionId,
    description: `Updated delivery method ${request.validatedBody.name}`,
  })

  response.status(200).json({ delivery_option: result[0] })
}
