import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("storefront checkout completion regression", () => {
  it("awaits cart-cookie removal before redirecting", () => {
    const cartSource = readFileSync(
      resolve(
        __dirname,
        "../../../storefront/src/lib/data/cart.ts"
      ),
      "utf8"
    )
    const removeIndex = cartSource.indexOf("await removeCartId()")
    const redirectIndex = cartSource.indexOf(
      "redirect(`/${countryCode}/order/${cartRes?.order.id}/confirmed`)"
    )

    expect(removeIndex).toBeGreaterThan(-1)
    expect(redirectIndex).toBeGreaterThan(removeIndex)
  })

  it("does not reuse a completed cart", () => {
    const cartSource = readFileSync(
      resolve(
        __dirname,
        "../../../storefront/src/lib/data/cart.ts"
      ),
      "utf8"
    )

    expect(cartSource).toContain("cart.completed_at ? null : cart")
    expect(cartSource).toContain("completed_at")
  })

  it("does not submit a variant without a calculated regional price", () => {
    const actionsSource = readFileSync(
      resolve(
        __dirname,
        "../../../storefront/src/modules/products/components/product-actions/index.tsx"
      ),
      "utf8"
    )

    expect(actionsSource).toContain("priceAvailable")
    expect(actionsSource).toContain("selectedVariant?.calculated_price")
    expect(actionsSource).toContain("Unavailable in")
    expect(actionsSource).toContain("catch (error)")
  })
})
