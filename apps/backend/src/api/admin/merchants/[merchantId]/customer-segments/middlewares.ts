import type { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import {
  MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH,
  MERCHANT_SEGMENT_NAME_MAX_LENGTH,
} from "../../../../../services/merchant-customer-segments"

const segmentName = z
  .string()
  .trim()
  .min(1)
  .max(MERCHANT_SEGMENT_NAME_MAX_LENGTH)
const segmentDescription = z
  .string()
  .trim()
  .max(MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH)
  .nullable()
  .optional()

export const ListMerchantCustomerSegmentsSchema = z.object({
  q: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListMerchantCustomerSegmentsQuery = z.infer<
  typeof ListMerchantCustomerSegmentsSchema
>

export const CreateMerchantCustomerSegmentSchema = z.object({
  name: segmentName,
  description: segmentDescription,
  customer_ids: z.array(z.string().min(1)).max(100).optional(),
})

export type CreateMerchantCustomerSegmentBody = z.infer<
  typeof CreateMerchantCustomerSegmentSchema
>

export const UpdateMerchantCustomerSegmentSchema = z
  .object({
    name: segmentName.optional(),
    description: segmentDescription,
  })
  .refine(
    ({ name, description }) => name !== undefined || description !== undefined,
    { message: "Provide a name or description to update" }
  )

export type UpdateMerchantCustomerSegmentBody = z.infer<
  typeof UpdateMerchantCustomerSegmentSchema
>

export const ManageMerchantCustomerSegmentCustomersSchema = z
  .object({
    add: z.array(z.string().min(1)).max(100).optional(),
    remove: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(({ add, remove }) => Boolean(add?.length || remove?.length), {
    message: "Provide at least one customer to add or remove",
  })

export type ManageMerchantCustomerSegmentCustomersBody = z.infer<
  typeof ManageMerchantCustomerSegmentCustomersSchema
>

export const merchantCustomerSegmentMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/customer-segments",
    methods: ["GET"],
    middlewares: [
      validateAndTransformQuery(ListMerchantCustomerSegmentsSchema, {
        defaults: ["id"],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/customer-segments",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(CreateMerchantCustomerSegmentSchema),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/customer-segments/:segmentId",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(UpdateMerchantCustomerSegmentSchema),
    ],
  },
  {
    matcher:
      "/admin/merchants/:merchantId/customer-segments/:segmentId/customers",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(ManageMerchantCustomerSegmentCustomersSchema),
    ],
  },
]
