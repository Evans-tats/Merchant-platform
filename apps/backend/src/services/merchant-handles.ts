import { MedusaError } from "@medusajs/framework/utils"

export const MERCHANT_HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Numbered handles tried (handle-2, handle-3, ...) before falling back to a
// random suffix when another store already uses the requested handle.
const NUMBERED_HANDLE_ATTEMPTS = 20

export type MerchantHandleResource = "collection" | "category"

export type HandleHolder = {
  id: string
  handle: string
  // Whether the record belongs to the merchant making the change.
  owned: boolean
}

/**
 * Builds a handle from a title or name the way Medusa does when no handle is
 * given, limited to characters that are safe in a storefront URL.
 */
export function handleFromTitle(
  title: string,
  fallback: MerchantHandleResource
): string {
  const handle = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return handle || fallback
}

export function handleCandidates(handle: string): string[] {
  return [
    handle,
    ...Array.from(
      { length: NUMBERED_HANDLE_ATTEMPTS },
      (_, index) => `${handle}-${index + 2}`
    ),
  ]
}

/**
 * Medusa requires collection and category handles to be unique across every
 * store. A clash with the merchant's own record is reported so they can pick
 * another handle. A clash with another store's record quietly moves to the
 * next free numbered handle, so stores never block each other or learn what
 * other stores have named things.
 */
export function pickMerchantHandle(input: {
  resource: MerchantHandleResource
  requested: string
  record_id?: string
  holders: HandleHolder[]
  // Handles already chosen for other records in the same request.
  reserved?: readonly string[]
  randomSuffix: () => string
}): string {
  const others = input.holders.filter(({ id }) => id !== input.record_id)
  const reserved = input.reserved ?? []
  const ownHandles = new Set([
    ...others.filter(({ owned }) => owned).map(({ handle }) => handle),
    ...reserved,
  ])

  if (ownHandles.has(input.requested)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `You already have a ${input.resource} with the handle "${input.requested}". Choose a different handle.`
    )
  }

  const takenHandles = new Set([
    ...others.map(({ handle }) => handle),
    ...reserved,
  ])
  const available = handleCandidates(input.requested).find(
    (candidate) => !takenHandles.has(candidate)
  )

  return available ?? `${input.requested}-${input.randomSuffix()}`
}
