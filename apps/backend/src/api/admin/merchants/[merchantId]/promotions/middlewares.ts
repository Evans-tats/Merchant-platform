import type { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import {
  MERCHANT_RULE_OPERATORS,
  PROMOTION_CODE_MAX_LENGTH,
} from "../../../../../services/merchant-promotions"
import { MerchantCampaignSchema } from "../campaigns/middlewares"

const promotionStatus = z.enum(["draft", "active", "inactive"])
const quantity = z.number().int().min(1).nullable().optional()
const currencyCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{3}$/)
  .nullable()
  .optional()

const rules = z
  .array(
    z.object({
      attribute: z.string().trim().min(1),
      operator: z.enum(MERCHANT_RULE_OPERATORS),
      values: z.array(z.string().trim().min(1)).min(1).max(100),
    })
  )
  .max(10)

export const ListMerchantPromotionsSchema = z.object({
  q: z.string().trim().max(255).optional(),
  status: promotionStatus.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListMerchantPromotionsQuery = z.infer<
  typeof ListMerchantPromotionsSchema
>

export const CreateMerchantPromotionSchema = z.object({
  code: z.string().trim().min(1).max(PROMOTION_CODE_MAX_LENGTH),
  type: z.enum(["standard", "buyget"]),
  status: promotionStatus.default("draft"),
  is_automatic: z.boolean().default(false),
  limit: quantity,
  application_method: z.object({
    type: z.enum(["fixed", "percentage"]),
    target_type: z.enum(["items", "order"]),
    allocation: z.enum(["each", "across"]).nullable().optional(),
    value: z.number().positive(),
    currency_code: currencyCode,
    max_quantity: quantity,
    buy_rules_min_quantity: quantity,
    apply_to_quantity: quantity,
  }),
  rules: rules.optional(),
  target_rules: rules.optional(),
  buy_rules: rules.optional(),
  campaign_id: z.string().min(1).nullable().optional(),
  campaign: MerchantCampaignSchema.optional(),
})

export type CreateMerchantPromotionBody = z.infer<
  typeof CreateMerchantPromotionSchema
>

export const UpdateMerchantPromotionSchema = z
  .object({
    code: z.string().trim().min(1).max(PROMOTION_CODE_MAX_LENGTH).optional(),
    status: promotionStatus.optional(),
    is_automatic: z.boolean().optional(),
    limit: quantity,
    application_method: z
      .object({
        value: z.number().positive().optional(),
        currency_code: currencyCode,
        max_quantity: quantity,
        buy_rules_min_quantity: quantity,
        apply_to_quantity: quantity,
      })
      .optional(),
    rules: rules.optional(),
    target_rules: rules.optional(),
    buy_rules: rules.optional(),
    campaign_id: z.string().min(1).nullable().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, {
    message: "Provide something to update",
  })

export type UpdateMerchantPromotionBody = z.infer<
  typeof UpdateMerchantPromotionSchema
>

export const merchantPromotionMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/promotions",
    methods: ["GET"],
    middlewares: [
      validateAndTransformQuery(ListMerchantPromotionsSchema, {
        defaults: ["id"],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/promotions",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CreateMerchantPromotionSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/promotions/:promotionId",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(UpdateMerchantPromotionSchema)],
  },
]
