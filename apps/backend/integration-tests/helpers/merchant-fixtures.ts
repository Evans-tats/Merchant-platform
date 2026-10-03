export type MerchantTestFixture = {
  merchant: {
    name: string
    slug: string
    status: "active" | "draft" | "suspended"
  }
  domain: {
    hostname: string
    isPrimary: boolean
    status: "active" | "disabled" | "pending" | "verified"
    type: "custom" | "platform"
  }
  owner: {
    email: string
    firstName: string
    lastName: string
    role: "owner"
    status: "active"
  }
  shopper: {
    email: string
    firstName: string
    lastName: string
  }
  product: {
    handle: string
    sku: string
    title: string
  }
}

export type MerchantTestFixtureOverrides = {
  merchant?: Partial<MerchantTestFixture["merchant"]>
  domain?: Partial<MerchantTestFixture["domain"]>
  owner?: Partial<MerchantTestFixture["owner"]>
  shopper?: Partial<MerchantTestFixture["shopper"]>
  product?: Partial<MerchantTestFixture["product"]>
}

const sharedShopper = {
  email: "shared-shopper@test.local",
  firstName: "Shared",
  lastName: "Shopper",
}

const merchantABase: MerchantTestFixture = {
  merchant: {
    name: "Merchant A",
    slug: "merchant-a",
    status: "active",
  },
  domain: {
    hostname: "merchant-a.shop.localhost",
    isPrimary: true,
    status: "active",
    type: "platform",
  },
  owner: {
    email: "owner-a@test.local",
    firstName: "Merchant",
    lastName: "Owner A",
    role: "owner",
    status: "active",
  },
  shopper: sharedShopper,
  product: {
    handle: "merchant-a-product",
    sku: "MERCHANT-A-SKU",
    title: "Merchant A Product",
  },
}

const merchantBBase: MerchantTestFixture = {
  merchant: {
    name: "Merchant B",
    slug: "merchant-b",
    status: "active",
  },
  domain: {
    hostname: "merchant-b.shop.localhost",
    isPrimary: true,
    status: "active",
    type: "platform",
  },
  owner: {
    email: "owner-b@test.local",
    firstName: "Merchant",
    lastName: "Owner B",
    role: "owner",
    status: "active",
  },
  shopper: sharedShopper,
  product: {
    handle: "merchant-b-product",
    sku: "MERCHANT-B-SKU",
    title: "Merchant B Product",
  },
}

function createMerchantFixture(
  base: MerchantTestFixture,
  overrides: MerchantTestFixtureOverrides = {}
): MerchantTestFixture {
  return {
    merchant: { ...base.merchant, ...overrides.merchant },
    domain: { ...base.domain, ...overrides.domain },
    owner: { ...base.owner, ...overrides.owner },
    shopper: { ...base.shopper, ...overrides.shopper },
    product: { ...base.product, ...overrides.product },
  }
}

export function createMerchantAFixture(
  overrides?: MerchantTestFixtureOverrides
) {
  return createMerchantFixture(merchantABase, overrides)
}

export function createMerchantBFixture(
  overrides?: MerchantTestFixtureOverrides
) {
  return createMerchantFixture(merchantBBase, overrides)
}
