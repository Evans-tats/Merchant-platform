import {
  createMerchantAFixture,
  createMerchantBFixture,
} from "../../integration-tests/helpers/merchant-fixtures"

describe("merchant test fixtures", () => {
  it("creates two isolated merchants with a shared shopper identity", () => {
    const merchantA = createMerchantAFixture()
    const merchantB = createMerchantBFixture()

    expect(merchantA.merchant.slug).not.toBe(merchantB.merchant.slug)
    expect(merchantA.domain.hostname).not.toBe(merchantB.domain.hostname)
    expect(merchantA.owner.email).not.toBe(merchantB.owner.email)
    expect(merchantA.product.sku).not.toBe(merchantB.product.sku)
    expect(merchantA.shopper.email).toBe(merchantB.shopper.email)
  })

  it("returns independent objects and applies nested overrides", () => {
    const first = createMerchantAFixture({
      merchant: { status: "suspended" },
    })
    const second = createMerchantAFixture()

    first.product.title = "Changed in one test"

    expect(first.merchant.status).toBe("suspended")
    expect(second.merchant.status).toBe("active")
    expect(second.product.title).toBe("Merchant A Product")
  })
})
