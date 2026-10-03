import { normalizeHostname } from "../services/tenant-resolution"

describe("normalizeHostname", () => {
  it("normalizes DNS case, a trailing dot, and a port", () => {
    expect(normalizeHostname(" Merchant-A.Shop.Localhost.:9000 ")).toBe(
      "merchant-a.shop.localhost"
    )
  })

  it.each([
    "https://merchant-a.shop.localhost",
    "merchant_a.shop.localhost",
    "merchant-a.shop.localhost/path",
    "merchant-a.shop.localhost@attacker.test",
    "",
  ])("rejects a non-host value: %s", (hostname) => {
    expect(() => normalizeHostname(hostname)).toThrow(
      "Hostname is invalid"
    )
  })
})
