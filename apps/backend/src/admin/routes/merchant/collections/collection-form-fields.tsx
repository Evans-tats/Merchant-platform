import { Input, clx } from "@medusajs/ui"

import {
  FieldError,
  FieldLabel,
  HandleField,
} from "../../../components/merchant/form-field"
import type {
  CollectionFormErrors,
  CollectionFormValues,
} from "./collection-form"

export const CollectionFormFields = ({
  values,
  errors,
  onChange,
  layout = "grid",
}: {
  values: CollectionFormValues
  errors: CollectionFormErrors
  onChange: (change: Partial<CollectionFormValues>) => void
  layout?: "grid" | "stack"
}) => {
  return (
    <div
      className={clx(
        "gap-4",
        layout === "grid"
          ? "grid grid-cols-1 md:grid-cols-2"
          : "flex flex-col"
      )}
    >
      <div className="flex flex-col gap-y-2">
        <FieldLabel htmlFor="collection-title">Title</FieldLabel>
        <Input
          id="collection-title"
          autoComplete="off"
          value={values.title}
          aria-invalid={Boolean(errors.title)}
          onChange={(event) => onChange({ title: event.target.value })}
        />
        <FieldError message={errors.title} />
      </div>
      <HandleField
        id="collection-handle"
        value={values.handle}
        title={values.title}
        error={errors.handle}
        example="summer-sale"
        tooltip="The handle is used in this collection's storefront address. If you leave it blank, it's created from the title."
        onChange={(handle) => onChange({ handle })}
      />
    </div>
  )
}
