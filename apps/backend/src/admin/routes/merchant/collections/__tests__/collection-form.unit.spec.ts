import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { adjustedHandleNotice } from "../../../../lib/handles"
import {
  collectionCreatePayload,
  collectionUpdatePayload,
  hasCollectionFormErrors,
  validateCollectionForm,
} from "../collection-form"

const readRoute = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8")

describe("merchant collection form", () => {
  it("only reports problems once the merchant submits", () => {
    expect(validateCollectionForm({ title: "", handle: "" })).toEqual({
      title: "Enter a title",
    })
    expect(
      validateCollectionForm({ title: "Summer", handle: "Summer Sale" }).handle
    ).toContain("lowercase letters")
    expect(
      hasCollectionFormErrors(
        validateCollectionForm({ title: "Summer", handle: "summer-sale" })
      )
    ).toBe(false)
  })

  it("leaves a blank handle out on create so it comes from the title", () => {
    expect(collectionCreatePayload({ title: " Summer ", handle: " " })).toEqual(
      { title: "Summer" }
    )
    expect(
      collectionCreatePayload({ title: "Summer", handle: "summer-edit" })
    ).toEqual({ title: "Summer", handle: "summer-edit" })
  })

  it("rebuilds a cleared handle from the title on edit", () => {
    expect(
      collectionUpdatePayload({ title: "Summer Sale", handle: "" })
    ).toEqual({ title: "Summer Sale", handle: "summer-sale" })
  })

  it("explains a handle changed because another store uses it", () => {
    expect(adjustedHandleNotice("summer", "summer")).toBeUndefined()
    expect(adjustedHandleNotice(undefined, "summer-2")).toBeUndefined()
    expect(adjustedHandleNotice("summer", "summer-2")).toContain("/summer-2")
  })

  it("creates collections in a full-screen window without browser validation", () => {
    const modal = readRoute("../create-collection-modal.tsx")
    const fields = readRoute("../collection-form-fields.tsx")

    expect(modal).toContain("<FocusModal")
    expect(modal).toContain("noValidate")
    expect(modal).toContain("navigate(`/merchant-collections/${collection.id}`)")
    expect(fields).toContain("aria-invalid")
    expect(fields).toContain("<HandleField")
    expect(fields).not.toContain("required")
  })

  it("reads catalog form values before the mutation runs", () => {
    const catalog = readRoute("../../catalog/page.tsx")

    expect(catalog).toContain("readShippingProfileForm(event.currentTarget)")
    expect(catalog).not.toContain(".mutate(event)")
    expect(catalog).not.toContain(" required")
  })
})
