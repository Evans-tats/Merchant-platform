import type { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const ListMerchantCustomersSchema = z.object({
  q: z.string().trim().max(255).optional(),
  account_type: z.enum(["registered", "guest"]).optional(),
  segment_id: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListMerchantCustomersQuery = z.infer<
  typeof ListMerchantCustomersSchema
>

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional()

export const CreateMerchantCustomerSchema = z.object({
  customer: z.object({
    email: z.string().trim().max(255).pipe(z.email()),
    first_name: optionalText(255),
    last_name: optionalText(255),
    company_name: optionalText(255),
    phone: optionalText(50),
  }),
  segment_ids: z.array(z.string().min(1)).max(50).optional(),
})

export type CreateMerchantCustomerBody = z.infer<
  typeof CreateMerchantCustomerSchema
>

export const ManageMerchantCustomerSegmentsSchema = z
  .object({
    add: z.array(z.string().min(1)).max(50).optional(),
    remove: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine(({ add, remove }) => Boolean(add?.length || remove?.length), {
    message: "Provide at least one segment to add or remove",
  })

export type ManageMerchantCustomerSegmentsBody = z.infer<
  typeof ManageMerchantCustomerSegmentsSchema
>

export const merchantCustomerMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/customers",
    methods: ["GET"],
    middlewares: [
      validateAndTransformQuery(ListMerchantCustomersSchema, {
        defaults: ["id"],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/customers",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CreateMerchantCustomerSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/customers/:customerId/segments",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(ManageMerchantCustomerSegmentsSchema),
    ],
  },
]
