import {
  type MiddlewareRoute,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

export const PostStoreAssistantMessageSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  session_id: z.string().min(1).optional(),
})

export type PostStoreAssistantMessageSchema = z.infer<
  typeof PostStoreAssistantMessageSchema
>

export const merchantAssistantMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/assistant",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(PostStoreAssistantMessageSchema)],
  },
]
