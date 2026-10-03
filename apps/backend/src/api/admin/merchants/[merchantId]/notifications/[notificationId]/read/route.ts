import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../../../utils/merchant-route-scope"
import { markMerchantNotificationReadWorkflow } from "../../../../../../../workflows/merchant-insights"

export const POST = async (
  request: MedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await markMerchantNotificationReadWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      notification_id: request.params.notificationId,
    },
  })

  response.status(200).json({ notification: result })
}
