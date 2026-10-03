"use server"

import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"

import { getCacheOptions } from "./cookies"

export async function listProductOptions() {
  const next = {
    ...(await getCacheOptions("product-options")),
  }

  return sdk.client
    .fetch<{
      product_options?: HttpTypes.StoreProductOption[]
    }>("/store/product-options", {
      method: "GET",
      query: {
        is_exclusive: false,
        fields: "*values",
      },
      next,
      cache: "force-cache",
    })
    .then(({ product_options }) => product_options ?? [])
}
