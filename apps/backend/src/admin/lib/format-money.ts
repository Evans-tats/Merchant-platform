// Kept apart from merchant-api, whose SDK client needs Vite, so plain
// helpers that format money can be unit tested.
export function formatMoney(
  amount: number | undefined,
  currencyCode = "KES"
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currencyCode.toUpperCase(),
  }).format(amount ?? 0)
}
