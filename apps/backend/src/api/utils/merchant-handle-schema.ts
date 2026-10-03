import { z } from "@medusajs/framework/zod"

import { MERCHANT_HANDLE_PATTERN } from "../../services/merchant-handles"

// Collection and category handles appear in storefront URLs.
export const MerchantHandleSchema = z
  .string()
  .trim()
  .max(255)
  .regex(
    MERCHANT_HANDLE_PATTERN,
    "Use lowercase letters, numbers, and single hyphens in the handle"
  )
