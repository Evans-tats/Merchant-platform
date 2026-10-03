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
