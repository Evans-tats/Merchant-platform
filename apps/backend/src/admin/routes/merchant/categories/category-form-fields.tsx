import { Input, Select, Text, Textarea, clx } from "@medusajs/ui"

import {
  FieldError,
  FieldLabel,
  HandleField,
} from "../../../components/merchant/form-field"
import type {
  CategoryFormErrors,
  CategoryFormValues,
} from "./category-form"

// Radix Select can't use an empty value, so the top level gets its own.
const TOP_LEVEL = "top-level"

export const CategoryFormFields = ({
  values,
  errors,
  parentOptions,
  onChange,
  layout = "grid",
}: {
  values: CategoryFormValues
  errors: CategoryFormErrors
  parentOptions: Array<{ id: string; label: string }>
  onChange: (change: Partial<CategoryFormValues>) => void
  layout?: "grid" | "stack"
}) => {
  const row = clx(
    "gap-4",
    layout === "grid" ? "grid grid-cols-1 md:grid-cols-2" : "flex flex-col"
  )

  return (
    <div className="flex flex-col gap-y-4">
      <div className={row}>
        <div className="flex flex-col gap-y-2">
          <FieldLabel htmlFor="category-name">Title</FieldLabel>
          <Input
            id="category-name"
            autoComplete="off"
            value={values.name}
            aria-invalid={Boolean(errors.name)}
            onChange={(event) => onChange({ name: event.target.value })}
          />
          <FieldError message={errors.name} />
        </div>
        <HandleField
          id="category-handle"
          value={values.handle}
          title={values.name}
          error={errors.handle}
          example="summer-dresses"
          tooltip="The handle is used in this category's storefront address. If you leave it blank, it's created from the title."
          onChange={(handle) => onChange({ handle })}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <FieldLabel htmlFor="category-description" optional>
          Description
        </FieldLabel>
        <Textarea
          id="category-description"
          value={values.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </div>
      <div className={row}>
        <div className="flex flex-col gap-y-2">
          <FieldLabel
            tooltip="Inactive categories are hidden from your storefront."
          >
            Status
          </FieldLabel>
          <Select
            value={values.status}
            onValueChange={(status) =>
              onChange({ status: status as CategoryFormValues["status"] })
            }
          >
            <Select.Trigger aria-label="Status">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="active">Active</Select.Item>
              <Select.Item value="inactive">Inactive</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="flex flex-col gap-y-2">
          <FieldLabel tooltip="Internal categories are only visible to your team, not to shoppers.">
            Visibility
          </FieldLabel>
          <Select
            value={values.visibility}
            onValueChange={(visibility) =>
              onChange({
                visibility: visibility as CategoryFormValues["visibility"],
              })
            }
          >
            <Select.Trigger aria-label="Visibility">
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="public">Public</Select.Item>
              <Select.Item value="internal">Internal</Select.Item>
            </Select.Content>
          </Select>
        </div>
      </div>
      <div className="flex flex-col gap-y-2">
        <FieldLabel optional>Parent category</FieldLabel>
        <Select
          value={values.parent_category_id || TOP_LEVEL}
          onValueChange={(value) =>
            onChange({
              parent_category_id: value === TOP_LEVEL ? "" : value,
            })
          }
        >
          <Select.Trigger aria-label="Parent category">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={TOP_LEVEL}>None (top level)</Select.Item>
            {parentOptions.map(({ id, label }) => (
              <Select.Item key={id} value={id}>
                {label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Put this category inside another, like Dresses inside Women.
        </Text>
      </div>
    </div>
  )
}
