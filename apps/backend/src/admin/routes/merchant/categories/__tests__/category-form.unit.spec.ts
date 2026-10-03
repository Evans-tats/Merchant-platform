import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import {
  categoryChoices,
  categoryCreatePayload,
  categoryFormFrom,
  categoryUpdatePayload,
  emptyCategoryForm,
  parentCategoryOptions,
  validateCategoryForm,
} from "../category-form"
import { nestCategories, visibleCategoryRows } from "../category-tree"

const readRoute = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8")

const tree = [
  { id: "women", name: "Women", handle: "women", depth: 0, parent_category_id: null },
  { id: "dresses", name: "Dresses", handle: "dresses", depth: 1, parent_category_id: "women" },
  { id: "maxi", name: "Maxi", handle: "maxi", depth: 2, parent_category_id: "dresses" },
  { id: "men", name: "Men", handle: "men", depth: 0, parent_category_id: null },
]

describe("merchant category form", () => {
  it("starts like Medusa's: active, public, top level, handle optional", () => {
    expect(emptyCategoryForm).toMatchObject({
      status: "active",
      visibility: "public",
      parent_category_id: "",
      handle: "",
    })
    expect(validateCategoryForm(emptyCategoryForm)).toEqual({
      name: "Enter a title",
    })
    expect(
      validateCategoryForm({ ...emptyCategoryForm, name: "Dresses", handle: "Bad Handle" }).handle
    ).toContain("lowercase letters")
  })

  it("maps status and visibility to Medusa's fields", () => {
    expect(
      categoryCreatePayload({
        ...emptyCategoryForm,
        name: " Dresses ",
        status: "inactive",
        visibility: "internal",
        parent_category_id: "women",
      })
    ).toEqual({
      name: "Dresses",
      is_active: false,
      is_internal: true,
      parent_category_id: "women",
    })
  })

  it("lets an edit clear the description, move to the top level, and rebuild the handle", () => {
    expect(
      categoryUpdatePayload({
        ...categoryFormFrom({
          name: "Summer Dresses",
          handle: "summer-dresses",
          description: "Light dresses",
          is_active: true,
          is_internal: false,
          parent_category_id: "women",
        }),
        handle: "",
        description: "",
        parent_category_id: "",
      })
    ).toEqual({
      name: "Summer Dresses",
      handle: "summer-dresses",
      description: "",
      is_active: true,
      is_internal: false,
      parent_category_id: null,
    })
  })

  it("labels parents by path and hides a category's own branch when editing", () => {
    expect(parentCategoryOptions(tree).map(({ label }) => label)).toEqual([
      "Women",
      "Women / Dresses",
      "Women / Dresses / Maxi",
      "Men",
    ])
    expect(
      parentCategoryOptions(tree, "dresses").map(({ id }) => id)
    ).toEqual(["women", "men"])
  })

  it("names product form choices by their full path, in tree order", () => {
    expect(categoryChoices(tree).map(({ name }) => name)).toEqual([
      "Women",
      "Women / Dresses",
      "Women / Dresses / Maxi",
      "Men",
    ])
  })

  it("nests categories for the drag-and-drop ranking tree", () => {
    expect(nestCategories(tree)).toEqual([
      {
        id: "women",
        name: "Women",
        category_children: [
          {
            id: "dresses",
            name: "Dresses",
            category_children: [
              { id: "maxi", name: "Maxi", category_children: [] },
            ],
          },
        ],
      },
      { id: "men", name: "Men", category_children: [] },
    ])
  })

  it("hides subcategories of collapsed parents and flattens search results", () => {
    expect(
      visibleCategoryRows(tree, new Set(), "").map(
        ({ id, indent, childCount }) => `${id}:${indent}:${childCount}`
      )
    ).toEqual(["women:0:1", "dresses:1:1", "maxi:2:0", "men:0:0"])
    expect(
      visibleCategoryRows(tree, new Set(["women"]), "").map(({ id }) => id)
    ).toEqual(["women", "men"])
    expect(
      visibleCategoryRows(tree, new Set(["dresses"]), "").map(({ id }) => id)
    ).toEqual(["women", "dresses", "men"])
    expect(
      visibleCategoryRows(tree, new Set(["women"]), "maxi").map(
        ({ id, indent }) => `${id}:${indent}`
      )
    ).toEqual(["maxi:0"])
  })

  it("creates categories in a full-screen window without browser validation", () => {
    const modal = readRoute("../create-category-modal.tsx")
    const fields = readRoute("../category-form-fields.tsx")

    expect(modal).toContain("<FocusModal")
    expect(modal).toContain("noValidate")
    expect(modal).toContain("navigate(`/merchant-categories/${category.id}`)")
    expect(fields).toContain("<HandleField")
    expect(fields).toContain("Parent category")
    expect(fields).not.toContain("required")
  })
})
