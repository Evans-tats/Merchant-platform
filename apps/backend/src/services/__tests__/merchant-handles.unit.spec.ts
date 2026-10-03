import {
  MERCHANT_HANDLE_PATTERN,
  handleCandidates,
  handleFromTitle,
  pickMerchantHandle,
} from "../merchant-handles"

const randomSuffix = () => "a1b2c3"

describe("merchant handles", () => {
  it("builds URL-safe handles from titles", () => {
    expect(handleFromTitle("Summer Sale", "collection")).toBe("summer-sale")
    expect(handleFromTitle("  Kitenge & Ankara  ", "category")).toBe(
      "kitenge-ankara"
    )
    expect(handleFromTitle("Café Crème 2026", "collection")).toBe(
      "cafe-creme-2026"
    )
    expect(handleFromTitle("!!!", "collection")).toBe("collection")
    expect(handleFromTitle("!!!", "category")).toBe("category")
    expect(handleFromTitle("Summer Sale", "collection")).toMatch(
      MERCHANT_HANDLE_PATTERN
    )
  })

  it("keeps a free handle", () => {
    expect(
      pickMerchantHandle({
        resource: "collection",
        requested: "summer",
        holders: [],
        randomSuffix,
      })
    ).toBe("summer")
  })

  it("rejects a handle the merchant already uses, naming the resource", () => {
    expect(() =>
      pickMerchantHandle({
        resource: "collection",
        requested: "summer",
        holders: [{ id: "pcol_own", handle: "summer", owned: true }],
        randomSuffix,
      })
    ).toThrow('You already have a collection with the handle "summer"')
    expect(() =>
      pickMerchantHandle({
        resource: "category",
        requested: "dresses",
        holders: [{ id: "pcat_own", handle: "dresses", owned: true }],
        randomSuffix,
      })
    ).toThrow('You already have a category with the handle "dresses"')
  })

  it("lets a record keep its own handle when edited", () => {
    expect(
      pickMerchantHandle({
        resource: "category",
        requested: "dresses",
        record_id: "pcat_own",
        holders: [{ id: "pcat_own", handle: "dresses", owned: true }],
        randomSuffix,
      })
    ).toBe("dresses")
  })

  it("numbers a handle another store already uses", () => {
    expect(
      pickMerchantHandle({
        resource: "collection",
        requested: "summer",
        holders: [
          { id: "pcol_other", handle: "summer", owned: false },
          { id: "pcol_other_2", handle: "summer-2", owned: false },
          { id: "pcol_own", handle: "summer-3", owned: true },
        ],
        randomSuffix,
      })
    ).toBe("summer-4")
  })

  it("falls back to a random suffix when every numbered handle is taken", () => {
    const holders = handleCandidates("summer").map((handle) => ({
      id: `pcol_${handle}`,
      handle,
      owned: false,
    }))

    expect(
      pickMerchantHandle({
        resource: "collection",
        requested: "summer",
        holders,
        randomSuffix,
      })
    ).toBe("summer-a1b2c3")
  })

  it("treats handles chosen earlier in the same request as the merchant's", () => {
    expect(() =>
      pickMerchantHandle({
        resource: "category",
        requested: "dresses",
        holders: [],
        reserved: ["dresses"],
        randomSuffix,
      })
    ).toThrow("You already have a category")
  })
})
