export const MAX_PRODUCT_IMAGES = 20
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
])
export const SUPPORTED_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/avif"

export const formatFileSize = (size: number) => {
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// Matches the backend's limit for one photo draft.
export const MAX_DRAFT_PHOTOS = 5
const DRAFT_PHOTO_MAX_EDGE = 1568

// Shrinks a photo before it is sent for a draft. Phone photos are far larger
// than the model needs, and smaller uploads save mobile data. Falls back to
// the original file if the browser can't decode it.
export const resizeImageForDraft = async (file: File): Promise<File> => {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(
      1,
      DRAFT_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height)
    )
    if (scale === 1 && file.type === "image/jpeg") {
      bitmap.close()
      return file
    }

    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    )
    if (!blob) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    })
  } catch {
    return file
  }
}

export const validateImageFiles = (files: File[], existingCount: number) => {
  const invalidType = files.find(
    (file) => !SUPPORTED_IMAGE_TYPES.has(file.type)
  )
  if (invalidType) {
    return `${invalidType.name} must be a JPEG, PNG, WebP, or AVIF image`
  }

  const oversized = files.find((file) => file.size > MAX_IMAGE_SIZE)
  if (oversized) {
    return `${oversized.name} is larger than 10 MB`
  }

  if (existingCount + files.length > MAX_PRODUCT_IMAGES) {
    return `A product can have up to ${MAX_PRODUCT_IMAGES} images`
  }

  return ""
}
