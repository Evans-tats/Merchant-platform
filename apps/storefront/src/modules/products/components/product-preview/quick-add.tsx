"use client"

import { addToCart } from "@lib/data/cart"
import { CheckMini, ShoppingBag } from "@medusajs/icons"
import { Button } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

type QuickAddProps = {
  /** Set only when the product has a single purchasable variant. */
  variantId?: string
  inStock: boolean
  handle: string
  title: string
}

const QuickAdd = ({ variantId, inStock, handle, title }: QuickAddProps) => {
  const countryCode = useParams().countryCode as string
  const [status, setStatus] = useState<"idle" | "adding" | "added" | "error">(
    "idle"
  )

  useEffect(() => {
    if (status !== "added") {
      return
    }

    const timer = setTimeout(() => setStatus("idle"), 2000)
    return () => clearTimeout(timer)
  }, [status])

  // Products with a choice of size, colour and so on need the product page.
  if (!variantId) {
    return (
      <LocalizedClientLink
        href={`/products/${handle}`}
        className="inline-flex h-11 w-full items-center justify-center rounded-full border border-brand-700/30 bg-white px-4 text-[15px] font-semibold text-brand-800 transition-colors hover:border-brand-700 hover:bg-brand-50"
        aria-label={`Choose options for ${title}`}
        data-testid="quick-add-options-link"
      >
        Choose options
      </LocalizedClientLink>
    )
  }

  const handleAdd = async () => {
    setStatus("adding")

    try {
      await addToCart({ variantId, quantity: 1, countryCode })
      setStatus("added")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button
        className="w-full px-3"
        onClick={handleAdd}
        disabled={!inStock}
        isLoading={status === "adding"}
        aria-label={inStock ? `Add ${title} to cart` : `${title} is out of stock`}
        data-testid="quick-add-button"
      >
        {!inStock ? (
          "Out of stock"
        ) : status === "adding" ? (
          "Adding"
        ) : status === "added" ? (
          <>
            <CheckMini aria-hidden="true" />
            Added
          </>
        ) : (
          <>
            <ShoppingBag aria-hidden="true" />
            Add to cart
          </>
        )}
      </Button>
      <p role="status" className="sr-only">
        {status === "added" ? `${title} added to cart` : ""}
      </p>
      {status === "error" && (
        <p role="alert" className="px-1 text-xs text-rose-700">
          Couldn&apos;t add this item. Please try again.
        </p>
      )}
    </div>
  )
}

export default QuickAdd
