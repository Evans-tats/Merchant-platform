import {
  filterSegments,
  segmentGroupMetadata,
  segmentGroupName,
  toMerchantCustomerSegment,
} from "../merchant-customer-segments"

describe("merchant customer segments", () => {
  it("namespaces the stored group name by merchant and ignores case and spacing", () => {
    expect(segmentGroupName("merch_a", "  VIP   Buyers ")).toBe(
      "merch_a:vip buyers"
    )
    expect(segmentGroupName("merch_a", "vip buyers")).toBe(
      segmentGroupName("merch_a", "VIP Buyers")
    )
    expect(segmentGroupName("merch_a", "VIP")).not.toBe(
      segmentGroupName("merch_b", "VIP")
    )
  })

  it("stores the merchant-facing name and description in metadata", () => {
    expect(
      segmentGroupMetadata({
        merchant_id: "merch_a",
        name: " Wholesale  buyers ",
        description: "  ",
        metadata: { source: "import" },
      })
    ).toEqual({
      source: "import",
      merchant_id: "merch_a",
      display_name: "Wholesale buyers",
      description: null,
    })
  })

  it("maps a core customer group to a merchant segment", () => {
    expect(
      toMerchantCustomerSegment({
        id: "cusgroup_1",
        name: "merch_a:vip",
        metadata: { display_name: "VIP", description: "Top spenders" },
        created_at: "2026-09-01T10:00:00.000Z",
        updated_at: new Date("2026-09-02T10:00:00.000Z"),
        customers: [{ id: "cus_1" }, { id: "cus_2" }],
      })
    ).toEqual({
      id: "cusgroup_1",
      name: "VIP",
      description: "Top spenders",
      customer_count: 2,
      created_at: "2026-09-01T10:00:00.000Z",
      updated_at: "2026-09-02T10:00:00.000Z",
    })
  })

  it("falls back to the unprefixed stored name when metadata is missing", () => {
    expect(
      toMerchantCustomerSegment({ id: "cusgroup_1", name: "merch_a:retail" })
    ).toEqual(
      expect.objectContaining({
        name: "retail",
        description: null,
        customer_count: 0,
      })
    )
  })

  it("searches by name or description and sorts by name", () => {
    const segments = [
      { name: "Wholesale", description: "Bulk buyers" },
      { name: "vip", description: null },
      { name: "Retail", description: "Walk-in buyers" },
    ].map((segment, index) => ({
      id: `cusgroup_${index}`,
      customer_count: 0,
      created_at: null,
      updated_at: null,
      ...segment,
    }))

    expect(filterSegments(segments).map(({ name }) => name)).toEqual([
      "Retail",
      "vip",
      "Wholesale",
    ])
    expect(filterSegments(segments, "BUYERS").map(({ name }) => name)).toEqual([
      "Retail",
      "Wholesale",
    ])
  })
})
