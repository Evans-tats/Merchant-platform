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

// What the member did with a suggestion card. "failed" carries the error the
// merchant route returned when they tried to approve it. "edits" holds what
// they changed on the card before approving; the workflow checks it against
// what the action allows.
export const ResolveStoreAssistantProposalSchema = z.object({
  status: z.enum(["approved", "dismissed", "failed"]),
  error: z.string().trim().max(1000).optional(),
  edits: z.record(z.string(), z.unknown()).optional(),
})

export type ResolveStoreAssistantProposalSchema = z.infer<
  typeof ResolveStoreAssistantProposalSchema
>

export const merchantAssistantMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/admin/merchants/:merchantId/assistant",
    methods: ["POST"],
    middlewares: [validateAndTransformBody(PostStoreAssistantMessageSchema)],
  },
  {
    matcher: "/admin/merchants/:merchantId/assistant/proposals/:proposalId",
    methods: ["POST"],
    middlewares: [
      validateAndTransformBody(ResolveStoreAssistantProposalSchema),
    ],
  },
]
