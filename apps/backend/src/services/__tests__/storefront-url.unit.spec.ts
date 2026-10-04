import { storefrontUrl } from "../storefront-url"

describe("storefront url", () => {
  const original = process.env.STOREFRONT_URL_TEMPLATE

  afterEach(() => {
    process.env.STOREFRONT_URL_TEMPLATE = original
  })

  it("defaults to the local storefront port", () => {
    delete process.env.STOREFRONT_URL_TEMPLATE

    expect(storefrontUrl("shop-a.localhost")).toBe("http://shop-a.localhost:8000")
  })

  it("follows the deployment's template", () => {
    process.env.STOREFRONT_URL_TEMPLATE = "https://{hostname}"
    expect(storefrontUrl("shop-a.dukazuri.shop")).toBe(
      "https://shop-a.dukazuri.shop"
    )

    process.env.STOREFRONT_URL_TEMPLATE =
      "https://storefront.up.railway.app/?shop={hostname}"
    expect(storefrontUrl("shop-a.demo")).toBe(
      "https://storefront.up.railway.app/?shop=shop-a.demo"
    )
  })
})
