import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("merchant order fulfillment form regression", () => {
  it("does not pass a React submit event across the mutation boundary", () => {
    const source = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")
    const formDataIndex = source.indexOf(
      "const form = new FormData(event.currentTarget)"
    )
    const mutationIndex = source.indexOf("mutate.mutate(command)")

    expect(source).not.toContain("mutate.mutate(event)")
    expect(source).toContain("onSubmit={submitFulfillment}")
    expect(formDataIndex).toBeGreaterThan(-1)
    expect(mutationIndex).toBeGreaterThan(formDataIndex)
  })

  it("renders the order customer and safe item-total fallbacks", () => {
    const source = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")

    expect(source).toContain('<Heading level="h2">Customer</Heading>')
    expect(source).toContain("orderCustomerPresentation(order)")
    expect(source).toContain("customer.email || \"No email provided\"")
    expect(source).toContain("customer.phone || \"No phone provided\"")
    expect(source).toContain("total === undefined ? \"—\"")
    expect(source).toContain(
      "canFulfillMerchantOrder(session.member.role, order.items)"
    )
  })

  it("only submits complete shipment labels", () => {
    const source = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")

    expect(source).toContain("const [labelUrl, setLabelUrl] = useState(\"\")")
    expect(source).toContain("label_url: trimmedLabelUrl")
    expect(source).toContain("hasAnyLabelValue")
    expect(source).toContain("or leave all three empty")
    expect(source).not.toContain('tracking_url: String(form.get("tracking_url")')
  })

  it("offers delivery only for shipped active fulfillments", () => {
    const source = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")

    expect(source).toContain("<CheckCircle /> Mark as delivered")
    expect(source).toContain(
      "fulfillment.shipped_at && !fulfillment.delivered_at && !fulfillment.canceled_at"
    )
    expect(source).toContain("Fulfillment delivered")
    expect(source).toContain("noNotification: !sendDeliveryNotification")
    expect(source).toContain("<Prompt.Title>Mark fulfillment as delivered?</Prompt.Title>")
  })

  it("lets only owners and admins mark an unconfirmed payment as paid", () => {
    const source = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")

    expect(source).toContain("<CheckCircle /> Mark as paid")
    expect(source).toContain('state === "to_confirm" && canManage')
    expect(source).toContain("/payments/${paymentId}/capture")
    expect(source).toContain("Only do this once you've received ${due}.")
  })
})
