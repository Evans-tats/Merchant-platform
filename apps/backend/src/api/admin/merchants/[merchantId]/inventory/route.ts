import type { InventoryTypes } from "@medusajs/framework/types"
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

import { getMerchantRouteScope } from "../../../../utils/merchant-route-scope"
import {
  adjustMerchantInventoryWorkflow,
} from "../../../../../workflows/merchant-inventory"
import { listMerchantInventoryWorkflow } from "../../../../../workflows/merchant-insights"
import { recordMerchantActivity } from "../../../../utils/record-merchant-activity"

type AdjustInventoryBody = {
  create?: InventoryTypes.CreateInventoryLevelInput[]
  update?: InventoryTypes.UpdateInventoryLevelInput[]
}

export const GET = async (
  request: AuthenticatedMedusaRequest,
  response: MedusaResponse
) => {
  const { result } = await listMerchantInventoryWorkflow(
    request.scope
  ).run({ input: getMerchantRouteScope(request) })

  response.status(200).json(result)
}

export const POST = async (
  request: AuthenticatedMedusaRequest<AdjustInventoryBody>,
  response: MedusaResponse
) => {
  const { result } = await adjustMerchantInventoryWorkflow(
    request.scope
  ).run({
    input: {
      ...getMerchantRouteScope(request),
      create: request.validatedBody.create,
      update: request.validatedBody.update,
    },
  })

  await recordMerchantActivity(request, {
    action: "inventory.adjusted",
    resource_type: "inventory",
    description: "Adjusted merchant inventory levels",
    metadata: {
      created: request.validatedBody.create?.length ?? 0,
      updated: request.validatedBody.update?.length ?? 0,
    },
  })
  const lowStockLevels = [
    ...(request.validatedBody.create ?? []),
    ...(request.validatedBody.update ?? []),
  ].filter(({ stocked_quantity }) =>
    typeof stocked_quantity === "number" && stocked_quantity <= 5
  )

  await Promise.all(lowStockLevels.map((level) =>
    recordMerchantActivity(request, {
      action: "inventory.low_stock",
      resource_type: "inventory_item",
      resource_id: level.inventory_item_id,
      description: `Inventory item ${level.inventory_item_id} is low on stock`,
      metadata: {
        location_id: level.location_id,
        stocked_quantity: level.stocked_quantity,
      },
      notification: {
        type: "inventory.low_stock",
        severity: Number(level.stocked_quantity) === 0 ? "critical" : "warning",
        title: Number(level.stocked_quantity) === 0 ? "Out of stock" : "Low stock",
        message: `Inventory item ${level.inventory_item_id} has ${level.stocked_quantity} units`,
      },
    })
  ))

  response.status(200).json({ inventory: result })
}
