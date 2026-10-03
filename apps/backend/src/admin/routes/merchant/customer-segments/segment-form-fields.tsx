import { Input, Label, Text, Textarea } from "@medusajs/ui"

import type { MerchantCustomerSegmentSummary } from "../../../lib/merchant-api"

export type SegmentFormValues = {
  name: string
  description: string | null
}

export function readSegmentForm(form: HTMLFormElement): SegmentFormValues {
  const data = new FormData(form)

  return {
    name: String(data.get("name") ?? "").trim(),
    description: String(data.get("description") ?? "").trim() || null,
  }
}

export const SegmentFormFields = ({
  segment,
}: {
  segment?: MerchantCustomerSegmentSummary
}) => {
  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="segment-name" weight="plus">
          Name
        </Label>
        <Input
          id="segment-name"
          name="name"
          defaultValue={segment?.name ?? ""}
          placeholder="VIP, Wholesale, Nairobi regulars"
          maxLength={120}
          required
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Label htmlFor="segment-description" weight="plus">
          Description
        </Label>
        <Textarea
          id="segment-description"
          name="description"
          defaultValue={segment?.description ?? ""}
          placeholder="Who belongs in this segment and why"
          maxLength={500}
        />
        <Text size="small" leading="compact" className="text-ui-fg-subtle">
          Optional. Only visible to your team.
        </Text>
      </div>
    </div>
  )
}
