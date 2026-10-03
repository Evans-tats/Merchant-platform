/**
 * Merchant customer segments are stored as core customer groups. Core group
 * names are unique across the whole platform, so the stored name is prefixed
 * with the owning merchant ID and the merchant-facing name lives in metadata.
 */

export type MerchantSegmentGroupSource = {
  id: string
  name?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: Date | string | null
  updated_at?: Date | string | null
  customers?: Array<{ id?: string }> | null
}

export type MerchantCustomerSegment = {
  id: string
  name: string
  description: string | null
  customer_count: number
  created_at: string | null
  updated_at: string | null
}

export const MERCHANT_SEGMENT_NAME_MAX_LENGTH = 120
export const MERCHANT_SEGMENT_DESCRIPTION_MAX_LENGTH = 500

export function normalizeSegmentName(name: string): string {
  return name.trim().replace(/\s+/g, " ")
}

export function segmentGroupName(merchantId: string, name: string): string {
  return `${merchantId}:${normalizeSegmentName(name).toLowerCase()}`
}

export function segmentGroupMetadata(input: {
  merchant_id: string
  name: string
  description?: string | null
  metadata?: Record<string, unknown> | null
}): Record<string, unknown> {
  const description = input.description?.trim()

  return {
    ...(input.metadata ?? {}),
    merchant_id: input.merchant_id,
    display_name: normalizeSegmentName(input.name),
    description: description ? description : null,
  }
}

function isoValue(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const date = value instanceof Date ? value : new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function displayName(group: MerchantSegmentGroupSource): string {
  const fromMetadata = group.metadata?.display_name

  if (typeof fromMetadata === "string" && fromMetadata.trim()) {
    return fromMetadata.trim()
  }

  const stored = group.name ?? ""
  const separator = stored.indexOf(":")

  return separator >= 0 ? stored.slice(separator + 1) : stored
}

export function toMerchantCustomerSegment(
  group: MerchantSegmentGroupSource
): MerchantCustomerSegment {
  const description = group.metadata?.description

  return {
    id: group.id,
    name: displayName(group),
    description:
      typeof description === "string" && description.trim()
        ? description.trim()
        : null,
    customer_count: group.customers?.length ?? 0,
    created_at: isoValue(group.created_at),
    updated_at: isoValue(group.updated_at),
  }
}

export function filterSegments(
  segments: MerchantCustomerSegment[],
  search?: string
): MerchantCustomerSegment[] {
  const term = search?.trim().toLowerCase()
  const matching = term
    ? segments.filter((segment) =>
        [segment.name, segment.description ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
    : segments

  return [...matching].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  )
}
