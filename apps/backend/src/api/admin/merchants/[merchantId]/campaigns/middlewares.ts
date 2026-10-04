import type { MiddlewareRoute } from "@medusajs/framework/http"
import {
  validateAndTransformBody,
  validateAndTransformQuery,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import {
  CAMPAIGN_DESCRIPTION_MAX_LENGTH,
  CAMPAIGN_NAME_MAX_LENGTH,
} from "../../../../../services/merchant-promotions"

const campaignName = z.string().trim().min(1).max(CAMPAIGN_NAME_MAX_LENGTH)
const campaignDescription = z
  .string()
  .trim()
  .max(CAMPAIGN_DESCRIPTION_MAX_LENGTH)
  .nullable()
  .optional()
const campaignDate = z.string().trim().min(1).max(40).nullable().optional()

export const MerchantCampaignSchema = z.object({
  name: campaignName,
  description: campaignDescription,
  starts_at: campaignDate,
  ends_at: campaignDate,
  budget: z
    .object({
      type: z.enum(["spend", "usage"]),
      limit: z.number().positive(),
      currency_code: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z]{3}$/)
        .nullable()
        .optional(),
    })
    .nullable()
    .optional(),
})

export const ListMerchantCampaignsSchema = z.object({
  q: z.string().trim().max(255).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export type ListMerchantCampaignsQuery = z.infer<
  typeof ListMerchantCampaignsSchema
>

export const CreateMerchantCampaignSchema = MerchantCampaignSchema

export type CreateMerchantCampaignBody = z.infer<
  typeof CreateMerchantCampaignSchema
>

export const UpdateMerchantCampaignSchema = z
  .object({
    name: campaignName.optional(),
    description: campaignDescription,
    starts_at: campaignDate,
    ends_at: campaignDate,
    budget: z.object({ limit: z.number().positive() }).optional(),
  })
  .refine((update) => Object.keys(update).length > 0, {
    message: "Provide something to update",
  })

export type UpdateMerchantCampaignBody = z.infer<
  typeof UpdateMerchantCampaignSchema
>

export const ManageMerchantCampaignPromotionsSchema = z
  .object({
    add: z.array(z.string().min(1)).max(100).optional(),
    remove: z.array(z.string().min(1)).max(100).optional(),
  })
  .refine(({ add, remove }) => Boolean(add?.length || remove?.length), {
    message: "Provide at least one promotion to add or remove",
  })

export type ManageMerchantCampaignPromotionsBody = z.infer<
  typeof ManageMerchantCampaignPromotionsSchema
>

export const merchantCampaignMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/campaigns",
    methods: ["GET"],
    middlewares: [
      validateAndTransformQuery(ListMerchantCampaignsSchema, {
        defaults: ["id"],
        isList: true,
      }),
    ],
  },
  {
    matcher: "/admin/merchants/:merchantId/campaigns",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(CreateMerchantCampaignSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/campaigns/:campaignId",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(UpdateMerchantCampaignSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/campaigns/:campaignId/promotions",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(ManageMerchantCampaignPromotionsSchema),
    ],
  },
]
