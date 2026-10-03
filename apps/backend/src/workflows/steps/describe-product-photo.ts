import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"

import {
  draftProductPhoto,
  ProductPhotoDraftError,
  type ProductPhotoDraft,
} from "../../services/product-photo-draft/draft-product-photo"

export type DescribeProductPhotoInput = {
  photos: Array<{ mimeType: string; content: string }>
  categories: Array<{ id: string; name: string }>
}

export type ProductDraftFromPhoto = Omit<ProductPhotoDraft, "category"> & {
  category_id: string | null
}

// Calls the vision model only; nothing is written, so there is no
// compensation.
export const describeProductPhotoStep = createStep(
  "describe-product-photo",
  async (input: DescribeProductPhotoInput, { container }) => {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)

    try {
      const { draft, model, usage } = await draftProductPhoto({
        images: input.photos.map((photo) => ({
          mimeType: photo.mimeType,
          base64: photo.content,
        })),
        categories: input.categories.map(({ name }) => name),
      })
      logger.info(
        `Product photo draft via ${model} from ${input.photos.length} photo(s): ${usage.input} input, ${usage.output} output, ${usage.thinking} thinking tokens`
      )

      const { category, ...rest } = draft
      const result: ProductDraftFromPhoto = {
        ...rest,
        category_id:
          input.categories.find(({ name }) => name === category)?.id ?? null,
      }

      return new StepResponse(result)
    } catch (error) {
      logger.error(
        `Product photo draft failed: ${error instanceof Error ? error.message : String(error)}`
      )
      if (
        error instanceof ProductPhotoDraftError &&
        error.reason === "not_configured"
      ) {
        throw new MedusaError(
          MedusaError.Types.NOT_ALLOWED,
          "Photo drafts aren't set up on this store yet"
        )
      }

      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Couldn't draft details from this photo right now. Try again, or fill in the details yourself."
      )
    }
  }
)
