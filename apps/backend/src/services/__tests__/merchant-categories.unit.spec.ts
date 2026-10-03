import {
  isOwnDescendant,
  orderCategoryTree,
  rankForPosition,
} from "../merchant-categories"

const category = (
  id: string,
  name: string,
  parent: string | null,
  rank = 0
) => ({ id, name, parent_category_id: parent, rank })

describe("merchant categories", () => {
  it("orders categories as a tree, by rank within each parent", () => {
    const ordered = orderCategoryTree([
      category("dresses", "Dresses", "women", 1),
      category("men", "Men", null, 1),
      category("women", "Women", null, 0),
      category("tops", "Tops", "women", 0),
      category("maxi", "Maxi", "dresses", 0),
    ])

    expect(ordered.map(({ id, depth }) => `${id}:${depth}`)).toEqual([
      "women:0",
      "tops:1",
      "dresses:1",
      "maxi:2",
      "men:0",
    ])
  })

  it("shows a category whose parent isn't listed at the top level", () => {
    expect(
      orderCategoryTree([category("orphan", "Orphan", "elsewhere")]).map(
        ({ depth }) => depth
      )
    ).toEqual([0])
  })

  describe("ranking among a store's own categories", () => {
    // Top level shared with another store: a1=0, b1=1, a2=2, b2=3, a3=4.
    const own = [
      { id: "a1", rank: 0 },
      { id: "a2", rank: 2 },
      { id: "a3", rank: 4 },
    ]
    const rank = (id: string, position: number, parent: string | null = null) => {
      const current = own.find((category) => category.id === id)!

      return rankForPosition({
        category: { ...current, parent_category_id: null },
        parent_category_id: parent,
        position,
        siblings: own,
        all_sibling_count: 5,
      })
    }

    it("moves up to the rank of the category it goes before", () => {
      expect(rank("a3", 0)).toBe(0)
      expect(rank("a3", 1)).toBe(2)
    })

    it("moves down to the rank of the category it goes after", () => {
      expect(rank("a1", 1)).toBe(2)
      expect(rank("a1", 2)).toBe(4)
    })

    it("keeps the rank when the position doesn't change", () => {
      expect(rank("a2", 1)).toBe(2)
      expect(rank("a1", 0)).toBe(0)
    })

    it("places a category moving to a new parent before the given sibling, or last", () => {
      expect(
        rankForPosition({
          category: { id: "x", rank: 7, parent_category_id: "elsewhere" },
          parent_category_id: null,
          position: 1,
          siblings: own,
          all_sibling_count: 5,
        })
      ).toBe(2)
      expect(
        rankForPosition({
          category: { id: "x", rank: 7, parent_category_id: "elsewhere" },
          parent_category_id: null,
          position: 9,
          siblings: own,
          all_sibling_count: 5,
        })
      ).toBe(5)
    })
  })

  it("spots a move that would put a category inside itself", () => {
    expect(isOwnDescendant("women", { id: "women", mpath: "women" })).toBe(
      true
    )
    expect(
      isOwnDescendant("women", { id: "maxi", mpath: "women.dresses.maxi" })
    ).toBe(true)
    expect(isOwnDescendant("dresses", { id: "men", mpath: "men" })).toBe(false)
  })
})
