import { InformationCircleSolid } from "@medusajs/icons"
import { Input, Label, Text, Tooltip } from "@medusajs/ui"
import type { ReactNode } from "react"

import { handleFromTitle } from "../../lib/handles"

export const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <Text size="small" leading="compact" className="text-ui-fg-error">
      {message}
    </Text>
  ) : null

// A label in Medusa's style, with an optional marker and help tooltip.
export const FieldLabel = ({
  htmlFor,
  children,
  optional,
  tooltip,
}: {
  htmlFor?: string
  children: ReactNode
  optional?: boolean
  tooltip?: string
}) => (
  <div className="flex items-center gap-x-1">
    <Label htmlFor={htmlFor} size="small" weight="plus">
      {children}
    </Label>
    {optional && (
      <Text size="small" leading="compact" className="text-ui-fg-muted">
        (Optional)
      </Text>
    )}
    {tooltip && (
      <Tooltip content={tooltip}>
        <InformationCircleSolid className="text-ui-fg-muted" />
      </Tooltip>
    )}
  </div>
)

/**
 * Medusa's handle input: a "/" prefix, and a placeholder showing the handle
 * a blank field gets from the title.
 */
export const HandleField = ({
  id,
  value,
  title,
  error,
  tooltip,
  example,
  onChange,
}: {
  id: string
  value: string
  title: string
  error?: string
  tooltip: string
  example: string
  onChange: (value: string) => void
}) => (
  <div className="flex flex-col gap-y-2">
    <FieldLabel htmlFor={id} optional tooltip={tooltip}>
      Handle
    </FieldLabel>
    <div className="relative">
      <div className="absolute inset-y-0 left-0 z-10 flex w-8 items-center justify-center border-r">
        <Text
          size="small"
          leading="compact"
          weight="plus"
          className="text-ui-fg-muted"
        >
          /
        </Text>
      </div>
      <Input
        id={id}
        className="pl-10"
        autoComplete="off"
        placeholder={handleFromTitle(title) || example}
        value={value}
        aria-invalid={Boolean(error)}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
    <FieldError message={error} />
  </div>
)
