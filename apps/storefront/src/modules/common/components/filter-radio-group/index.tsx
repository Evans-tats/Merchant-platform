import { clx } from "@modules/common/components/ui"

type FilterRadioGroupProps = {
  title: string
  items: {
    value: string
    label: string
  }[]
  value: string
  handleChange: (value: string) => void
  "data-testid"?: string
}

const FilterRadioGroup = ({
  title,
  items,
  value,
  handleChange,
  "data-testid": dataTestId,
}: FilterRadioGroupProps) => {
  return (
    <fieldset className="flex flex-col gap-3 min-w-0">
      <legend className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-muted">
        {title}
      </legend>
      <div
        className="flex gap-2 overflow-x-auto no-scrollbar small:flex-wrap"
        data-testid={dataTestId}
      >
        {items?.map((i) => {
          const checked = i.value === value

          return (
            <label
              key={i.value}
              htmlFor={i.value}
              className={clx(
                "inline-flex h-10 shrink-0 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-600 has-[:focus-visible]:ring-offset-2",
                checked
                  ? "border-brand-700 bg-brand-700 text-white"
                  : "border-ink/15 bg-white text-ink hover:border-brand-700 hover:text-brand-800"
              )}
              data-testid="radio-label"
              data-active={checked}
            >
              <input
                type="radio"
                className="sr-only"
                name={title}
                id={i.value}
                value={i.value}
                checked={checked}
                onChange={() => handleChange(i.value)}
              />
              {i.label}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export default FilterRadioGroup
