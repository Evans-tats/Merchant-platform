import { Text } from "@modules/common/components/ui"
import { VariantPrice } from "types/global"

export default async function PreviewPrice({ price }: { price: VariantPrice }) {
  if (!price) {
    return null
  }

  return (
    <>
      <Text
        className="text-base font-extrabold text-brand-700 small:text-lg"
        data-testid="price"
      >
        {price.calculated_price}
      </Text>
      {price.price_type === "sale" && (
        <Text
          className="text-sm text-ink-muted line-through"
          data-testid="original-price"
        >
          {price.original_price}
        </Text>
      )}
    </>
  )
}
