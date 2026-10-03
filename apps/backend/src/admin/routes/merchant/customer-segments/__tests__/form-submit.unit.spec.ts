import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const readRoute = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8")

describe("merchant customer form submission regressions", () => {
  it("extracts segment form values before crossing the mutation boundary", () => {
    const listPage = readRoute("../page.tsx")
    const detailPage = readRoute("../[id]/page.tsx")

    expect(listPage).toContain(
      "createSegment.mutate(readSegmentForm(event.currentTarget))"
    )
    expect(detailPage).toContain(
      "updateSegment.mutate(readSegmentForm(event.currentTarget))"
    )
    expect(listPage).not.toContain("createSegment.mutate(event)")
    expect(detailPage).not.toContain("updateSegment.mutate(event)")
  })

  it("extracts customer form values before crossing the mutation boundary", () => {
    const listPage = readRoute("../../customers/page.tsx")
    const detailPage = readRoute("../../customers/[id]/page.tsx")

    expect(listPage).toContain(
      "readCreateCustomerForm(event.currentTarget, segmentIds)"
    )
    expect(listPage).not.toContain("createCustomer.mutate(event)")
    expect(detailPage).toContain("onSubmit={submitCustomer}")
    expect(detailPage).toContain("onSubmit={submitAddress}")
    expect(detailPage).toContain("onSubmit={submitNote}")
    expect(detailPage).not.toContain("updateCustomer.mutate(event)")
    expect(detailPage).not.toContain("createAddress.mutate(event)")
    expect(detailPage).not.toContain("addNote.mutate(event)")
  })
})
