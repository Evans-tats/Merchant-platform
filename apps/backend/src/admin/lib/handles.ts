export const HANDLE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function handleError(example: string) {
  return `Use lowercase letters, numbers, and single hyphens, like ${example}`
}

// Mirrors the backend so placeholders show the handle a blank field gets.
export function handleFromTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Explains a saved handle that differs from the one asked for, which happens
 * when another store already uses it.
 */
export function adjustedHandleNotice(
  requested: string | undefined,
  saved: string
): string | undefined {
  if (!requested || requested === saved) {
    return undefined
  }

  return `/${requested} is already in use, so the handle is /${saved}.`
}
