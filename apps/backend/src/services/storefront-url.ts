// Public address of a store. STOREFRONT_URL_TEMPLATE sets the shape for the
// deployment: "http://{hostname}:8000" locally, "https://{hostname}" behind a
// wildcard domain, or "https://<shared host>/?shop={hostname}" when every
// store shares the storefront's one address (STOREFRONT_SHARED_HOST).
export function storefrontUrl(hostname: string): string {
  return (process.env.STOREFRONT_URL_TEMPLATE || "http://{hostname}:8000").replace(
    "{hostname}",
    hostname
  )
}
