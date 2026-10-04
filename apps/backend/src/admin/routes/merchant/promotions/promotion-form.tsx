import {
  Checkbox,
  Input,
  Label,
  RadioGroup,
  Select,
  Text,
  Textarea,
} from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useDeferredValue, useState } from "react"

import {
  merchantApi,
  merchantQueryKeys,
  type MerchantCampaignListResponse,
  type MerchantCategoryListResponse,
  type MerchantCollectionListResponse,
  type MerchantCustomerSegmentListResponse,
  type MerchantProduct,
} from "../../../lib/merchant-api"
import {
  PROMOTION_TEMPLATES,
  type CampaignFormState,
  type ItemCondition,
  type ItemScope,
  type PromotionFormState,
  type PromotionTemplateId,
} from "../../../lib/merchant-promotions"

type Option = { id: string; label: string }

type OptionSource = "segments" | Exclude<ItemScope, "all">

const optionSuffixes: Record<OptionSource, (search: string) => string> = {
  segments: () => "/customer-segments?limit=100&offset=0",
  collections: () => "/collections",
  categories: () => "/categories",
  products: (search) =>
    `/products?limit=50&offset=0&order=-created_at${search ? `&q=${encodeURIComponent(search)}` : ""}`,
}

const readOptions = (source: OptionSource, response: unknown): Option[] => {
  switch (source) {
    case "segments":
      return (response as MerchantCustomerSegmentListResponse).customer_segments.map(
        ({ id, name }) => ({ id, label: name })
      )
    case "collections":
      return (response as MerchantCollectionListResponse).collections.map(
        ({ id, title }) => ({ id, label: title })
      )
    case "categories":
      return (response as MerchantCategoryListResponse).product_categories.map(
        ({ id, name }) => ({ id, label: name })
      )
    case "products":
      return (response as { products: MerchantProduct[] }).products.map(
        ({ id, title }) => ({ id, label: title })
      )
  }
}

const sourceNouns: Record<OptionSource, string> = {
  segments: "customer segments",
  collections: "collections",
  categories: "categories",
  products: "products",
}

// A searchable list of the merchant's own segments or catalog to tick.
// Chosen items stay listed even when a search hides them.
const OptionChecklist = ({
  id,
  merchantId,
  source,
  selected,
  knownLabels,
  onChange,
}: {
  id: string
  merchantId: string
  source: OptionSource
  selected: string[]
  knownLabels?: Map<string, string>
  onChange: (ids: string[]) => void
}) => {
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim())
  const serverSearch = source === "products" ? deferredSearch : ""
  const optionsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(merchantId, `promotion-options/${source}`),
      serverSearch,
    ],
    queryFn: async () =>
      readOptions(
        source,
        await merchantApi.get(merchantId, optionSuffixes[source](serverSearch))
      ),
  })
  const loaded = optionsQuery.data ?? []
  const term = deferredSearch.toLowerCase()
  const visible = loaded.filter(
    ({ label }) => source === "products" || !term || label.toLowerCase().includes(term)
  )
  const labels = new Map([
    ...(knownLabels ?? new Map<string, string>()),
    ...loaded.map(({ id: optionId, label }) => [optionId, label] as const),
  ])
  const hiddenSelected = selected
    .filter((value) => !visible.some((option) => option.id === value))
    .map((value) => ({ id: value, label: labels.get(value) ?? value }))
  const options = [...hiddenSelected, ...visible]

  const toggle = (optionId: string, checked: boolean) =>
    onChange(
      checked
        ? [...selected, optionId]
        : selected.filter((value) => value !== optionId)
    )

  return (
    <div className="flex flex-col gap-y-2">
      <Label htmlFor={`${id}-search`} className="sr-only">
        Search {sourceNouns[source]}
      </Label>
      <Input
        id={`${id}-search`}
        size="small"
        type="search"
        placeholder={`Search ${sourceNouns[source]}`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-ui-border-base">
        {optionsQuery.isPending && (
          <Text size="small" className="px-3 py-2 text-ui-fg-muted">
            Loading…
          </Text>
        )}
        {!optionsQuery.isPending && !options.length && (
          <Text size="small" className="px-3 py-2 text-ui-fg-subtle">
            No {sourceNouns[source]} found.
          </Text>
        )}
        <ul className="divide-y divide-ui-border-base">
          {options.map((option) => {
            const checkboxId = `${id}-${option.id}`

            return (
              <li key={option.id} className="flex items-center gap-x-2 px-3 py-2">
                <Checkbox
                  id={checkboxId}
                  checked={selected.includes(option.id)}
                  onCheckedChange={(checked) => toggle(option.id, checked === true)}
                />
                <Label htmlFor={checkboxId} size="small" className="min-w-0 truncate">
                  {option.label}
                </Label>
              </li>
            )
          })}
        </ul>
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {selected.length} selected
      </Text>
    </div>
  )
}

// How much of a campaign's budget is used. Nothing without a limit.
export const BudgetBar = ({ percent }: { percent: number | null }) =>
  percent === null ? null : (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-ui-bg-component"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label="Budget used"
    >
      <div className="h-full bg-ui-fg-interactive" style={{ width: `${percent}%` }} />
    </div>
  )

const FieldLabel = ({ htmlFor, children }: { htmlFor?: string; children: string }) => (
  <Label htmlFor={htmlFor} size="small" weight="plus">
    {children}
  </Label>
)

const Hint = ({ children }: { children: string }) => (
  <Text size="small" className="text-ui-fg-subtle">
    {children}
  </Text>
)

export const TemplatePicker = ({
  value,
  onChange,
}: {
  value: PromotionTemplateId
  onChange: (value: PromotionTemplateId) => void
}) => (
  <RadioGroup
    className="grid grid-cols-1 gap-3 md:grid-cols-2"
    value={value}
    onValueChange={(next) => onChange(next as PromotionTemplateId)}
  >
    {PROMOTION_TEMPLATES.map((template) => (
      <RadioGroup.ChoiceBox
        key={template.id}
        value={template.id}
        label={template.label}
        description={template.description}
      />
    ))}
  </RadioGroup>
)

const itemScopeLabels: Record<ItemScope, string> = {
  all: "All products",
  products: "Specific products",
  collections: "Products in collections",
  categories: "Products in categories",
}

const ItemConditionField = ({
  id,
  merchantId,
  label,
  condition,
  allowAll,
  knownLabels,
  onChange,
}: {
  id: string
  merchantId: string
  label: string
  condition: ItemCondition
  allowAll: boolean
  knownLabels?: Map<string, string>
  onChange: (condition: ItemCondition) => void
}) => {
  const scopes = (Object.keys(itemScopeLabels) as ItemScope[]).filter(
    (scope) => allowAll || scope !== "all"
  )

  return (
    <fieldset className="flex flex-col gap-y-3">
      <legend className="mb-3">
        <Text size="small" weight="plus">
          {label}
        </Text>
      </legend>
      <RadioGroup
        className="flex flex-col gap-y-2"
        value={condition.scope}
        onValueChange={(scope) => onChange({ scope: scope as ItemScope, ids: [] })}
      >
        {scopes.map((scope) => (
          <div key={scope} className="flex items-center gap-x-2">
            <RadioGroup.Item value={scope} id={`${id}-${scope}`} />
            <Label htmlFor={`${id}-${scope}`} size="small">
              {itemScopeLabels[scope]}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {condition.scope !== "all" && (
        <OptionChecklist
          id={`${id}-options`}
          merchantId={merchantId}
          source={condition.scope}
          selected={condition.ids}
          knownLabels={knownLabels}
          onChange={(ids) => onChange({ ...condition, ids })}
        />
      )}
    </fieldset>
  )
}

const CurrencySelect = ({
  id,
  value,
  currencies,
  onChange,
}: {
  id: string
  value: string
  currencies: string[]
  onChange: (value: string) => void
}) => (
  <Select value={value} onValueChange={onChange}>
    <Select.Trigger id={id} className="w-28">
      <Select.Value />
    </Select.Trigger>
    <Select.Content>
      {currencies.map((currency) => (
        <Select.Item key={currency} value={currency}>
          {currency.toUpperCase()}
        </Select.Item>
      ))}
    </Select.Content>
  </Select>
)

/**
 * The promotion's details: how shoppers get it, the discount, which items
 * and who. Creating and editing share it; what's fixed after creation (the
 * type and how a fixed amount is spread) is only offered when creating.
 */
export const PromotionDetailsFields = ({
  merchantId,
  form,
  currencies,
  mode,
  knownLabels,
  onChange,
}: {
  merchantId: string
  form: PromotionFormState
  currencies: string[]
  mode: "create" | "edit"
  knownLabels?: Map<string, string>
  onChange: (update: Partial<PromotionFormState>) => void
}) => {
  const template = form.template
  const buyGet = template === "buy_get"
  const percentage = buyGet || template.startsWith("percentage")
  const itemsTarget = buyGet || template.endsWith("products")
  const fixedItems = template === "amount_off_products"
  const prefix = percentage ? "%" : form.currency_code.toUpperCase()

  return (
    <div className="flex flex-col gap-y-8">
      <fieldset className="flex flex-col gap-y-3">
        <legend className="mb-3">
          <Text size="small" weight="plus">
            How shoppers get it
          </Text>
        </legend>
        <RadioGroup
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
          value={form.is_automatic ? "automatic" : "code"}
          onValueChange={(value) => onChange({ is_automatic: value === "automatic" })}
        >
          <RadioGroup.ChoiceBox
            value="code"
            label="With a code"
            description="Shoppers type the code in the cart."
          />
          <RadioGroup.ChoiceBox
            value="automatic"
            label="Automatically"
            description="Applies to every cart that qualifies."
          />
        </RadioGroup>
        <div className="flex flex-col gap-y-2">
          <FieldLabel htmlFor="promotion-code">Code</FieldLabel>
          <Input
            id="promotion-code"
            value={form.code}
            maxLength={40}
            placeholder="VIP10"
            onChange={(event) => onChange({ code: event.target.value.toUpperCase() })}
          />
          <Hint>
            {form.is_automatic
              ? "Shoppers don't type it. It names the promotion on orders."
              : "Letters, numbers, dashes or underscores. Codes are unique across the platform."}
          </Hint>
        </div>
      </fieldset>

      <div className="flex flex-col gap-y-2">
        <FieldLabel htmlFor="promotion-value">
          {buyGet ? "Discount on the items they get" : "Discount"}
        </FieldLabel>
        <div className="flex items-center gap-x-2">
          <Input
            id="promotion-value"
            type="number"
            min={0}
            max={percentage ? 100 : undefined}
            step="any"
            value={form.value}
            className="w-40"
            onChange={(event) => onChange({ value: event.target.value })}
          />
          {percentage || currencies.length <= 1 ? (
            <Text size="small" className="text-ui-fg-subtle">
              {prefix}
            </Text>
          ) : (
            <CurrencySelect
              id="promotion-currency"
              value={form.currency_code}
              currencies={currencies}
              onChange={(currency_code) => onChange({ currency_code })}
            />
          )}
        </div>
        {buyGet && <Hint>100% makes them free.</Hint>}
      </div>

      {fixedItems && (
        <fieldset className="flex flex-col gap-y-3">
          <legend className="mb-3">
            <Text size="small" weight="plus">
              How the amount comes off
            </Text>
          </legend>
          {mode === "create" ? (
            <RadioGroup
              className="flex flex-col gap-y-2"
              value={form.allocation}
              onValueChange={(value) =>
                onChange({ allocation: value as PromotionFormState["allocation"] })
              }
            >
              <div className="flex items-center gap-x-2">
                <RadioGroup.Item value="each" id="allocation-each" />
                <Label htmlFor="allocation-each" size="small">
                  Off each item
                </Label>
              </div>
              <div className="flex items-center gap-x-2">
                <RadioGroup.Item value="across" id="allocation-across" />
                <Label htmlFor="allocation-across" size="small">
                  Off the matching items in total
                </Label>
              </div>
            </RadioGroup>
          ) : (
            <Hint>
              {form.allocation === "each"
                ? "Off each item"
                : "Off the matching items in total"}
            </Hint>
          )}
          {form.allocation === "each" && (
            <div className="flex flex-col gap-y-2">
              <FieldLabel htmlFor="promotion-max-quantity">
                Items per order that get it
              </FieldLabel>
              <Input
                id="promotion-max-quantity"
                type="number"
                min={1}
                step={1}
                className="w-40"
                value={form.max_quantity}
                onChange={(event) => onChange({ max_quantity: event.target.value })}
              />
            </div>
          )}
        </fieldset>
      )}

      {buyGet && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-y-2">
            <FieldLabel htmlFor="promotion-buy-quantity">They buy at least</FieldLabel>
            <Input
              id="promotion-buy-quantity"
              type="number"
              min={1}
              step={1}
              value={form.buy_quantity}
              onChange={(event) => onChange({ buy_quantity: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <FieldLabel htmlFor="promotion-get-quantity">And get</FieldLabel>
            <Input
              id="promotion-get-quantity"
              type="number"
              min={1}
              step={1}
              value={form.get_quantity}
              onChange={(event) => onChange({ get_quantity: event.target.value })}
            />
          </div>
        </div>
      )}

      {buyGet && (
        <ItemConditionField
          id="promotion-buy-items"
          merchantId={merchantId}
          label="Items they buy"
          condition={form.buy_items}
          allowAll={false}
          knownLabels={knownLabels}
          onChange={(buy_items) => onChange({ buy_items })}
        />
      )}

      {itemsTarget && (
        <ItemConditionField
          id="promotion-items"
          merchantId={merchantId}
          label={buyGet ? "Items they get" : "Which items"}
          condition={form.items}
          allowAll={!buyGet}
          knownLabels={knownLabels}
          onChange={(items) => onChange({ items })}
        />
      )}

      <fieldset className="flex flex-col gap-y-3">
        <legend className="mb-3">
          <Text size="small" weight="plus">
            Who can use it
          </Text>
        </legend>
        <RadioGroup
          className="flex flex-col gap-y-2"
          value={form.who}
          onValueChange={(value) =>
            onChange(
              value === "everyone"
                ? { who: "everyone", segment_ids: [] }
                : { who: "segments" }
            )
          }
        >
          <div className="flex items-center gap-x-2">
            <RadioGroup.Item value="everyone" id="who-everyone" />
            <Label htmlFor="who-everyone" size="small">
              Everyone
            </Label>
          </div>
          <div className="flex items-center gap-x-2">
            <RadioGroup.Item value="segments" id="who-segments" />
            <Label htmlFor="who-segments" size="small">
              Customers in segments
            </Label>
          </div>
        </RadioGroup>
        {form.who === "segments" && (
          <>
            <OptionChecklist
              id="promotion-segments"
              merchantId={merchantId}
              source="segments"
              selected={form.segment_ids}
              knownLabels={knownLabels}
              onChange={(segment_ids) => onChange({ segment_ids })}
            />
            <Hint>Only signed-in customers in these segments get it.</Hint>
          </>
        )}
      </fieldset>

      <div className="flex flex-col gap-y-2">
        <FieldLabel htmlFor="promotion-limit">Maximum uses</FieldLabel>
        <Input
          id="promotion-limit"
          type="number"
          min={1}
          step={1}
          className="w-40"
          placeholder="No limit"
          value={form.limit}
          onChange={(event) => onChange({ limit: event.target.value })}
        />
        <Hint>Leave empty for no limit.</Hint>
      </div>
    </div>
  )
}

/** A campaign's name, dates and budget. A budget's type is fixed once saved. */
export const CampaignFields = ({
  idPrefix,
  campaign,
  currencyCode,
  budgetLocked = false,
  onChange,
}: {
  idPrefix: string
  campaign: CampaignFormState
  currencyCode: string
  budgetLocked?: boolean
  onChange: (update: Partial<CampaignFormState>) => void
}) => (
  <div className="flex flex-col gap-y-6">
    <div className="flex flex-col gap-y-2">
      <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
      <Input
        id={`${idPrefix}-name`}
        value={campaign.name}
        maxLength={120}
        placeholder="Black Friday"
        onChange={(event) => onChange({ name: event.target.value })}
      />
    </div>
    <div className="flex flex-col gap-y-2">
      <FieldLabel htmlFor={`${idPrefix}-description`}>Description</FieldLabel>
      <Textarea
        id={`${idPrefix}-description`}
        value={campaign.description}
        maxLength={500}
        rows={2}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    </div>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-y-2">
        <FieldLabel htmlFor={`${idPrefix}-starts`}>Starts</FieldLabel>
        <Input
          id={`${idPrefix}-starts`}
          type="date"
          value={campaign.starts_at}
          onChange={(event) => onChange({ starts_at: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <FieldLabel htmlFor={`${idPrefix}-ends`}>Ends</FieldLabel>
        <Input
          id={`${idPrefix}-ends`}
          type="date"
          value={campaign.ends_at}
          min={campaign.starts_at || undefined}
          onChange={(event) => onChange({ ends_at: event.target.value })}
        />
      </div>
    </div>
    <fieldset className="flex flex-col gap-y-3">
      <legend className="mb-3">
        <Text size="small" weight="plus">
          Budget
        </Text>
      </legend>
      {budgetLocked ? (
        <Hint>
          {campaign.budget_type === "none"
            ? "No budget. A budget can only be set when the campaign is created."
            : campaign.budget_type === "usage"
              ? "Limited by number of uses."
              : `Limited by the total ${currencyCode.toUpperCase()} given.`}
        </Hint>
      ) : (
        <RadioGroup
          className="flex flex-col gap-y-2"
          value={campaign.budget_type}
          onValueChange={(value) =>
            onChange({ budget_type: value as CampaignFormState["budget_type"] })
          }
        >
          {(
            [
              ["none", "No limit"],
              ["usage", "Stop after a number of uses"],
              ["spend", `Stop after a total ${currencyCode.toUpperCase()} given`],
            ] as const
          ).map(([value, label]) => (
            <div key={value} className="flex items-center gap-x-2">
              <RadioGroup.Item value={value} id={`${idPrefix}-budget-${value}`} />
              <Label htmlFor={`${idPrefix}-budget-${value}`} size="small">
                {label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}
      {campaign.budget_type !== "none" && (
        <div className="flex flex-col gap-y-2">
          <FieldLabel htmlFor={`${idPrefix}-budget-limit`}>
            {campaign.budget_type === "usage"
              ? "Number of uses"
              : `Total ${currencyCode.toUpperCase()} to give`}
          </FieldLabel>
          <Input
            id={`${idPrefix}-budget-limit`}
            type="number"
            min={1}
            step={campaign.budget_type === "usage" ? 1 : "any"}
            className="w-40"
            value={campaign.budget_limit}
            onChange={(event) => onChange({ budget_limit: event.target.value })}
          />
        </div>
      )}
    </fieldset>
  </div>
)

/** Step 3 of creating a promotion: none, an existing campaign, or a new one. */
export const CampaignChoiceFields = ({
  merchantId,
  form,
  allowNew,
  onChange,
}: {
  merchantId: string
  form: PromotionFormState
  allowNew: boolean
  onChange: (update: Partial<PromotionFormState>) => void
}) => {
  const campaignsQuery = useQuery({
    queryKey: [...merchantQueryKeys.resource(merchantId, "campaigns"), "choices"],
    queryFn: () =>
      merchantApi.get<MerchantCampaignListResponse>(
        merchantId,
        "/campaigns?limit=100&offset=0"
      ),
  })
  const campaigns = campaignsQuery.data?.campaigns ?? []

  return (
    <div className="flex flex-col gap-y-6">
      <RadioGroup
        className="grid grid-cols-1 gap-3 md:grid-cols-3"
        value={form.campaign_mode}
        onValueChange={(value) =>
          onChange({ campaign_mode: value as PromotionFormState["campaign_mode"] })
        }
      >
        <RadioGroup.ChoiceBox
          value="none"
          label="No campaign"
          description="Runs until you deactivate it."
        />
        <RadioGroup.ChoiceBox
          value="existing"
          label="Existing campaign"
          description="Shares its dates and budget."
          disabled={!campaigns.length}
        />
        {allowNew && (
          <RadioGroup.ChoiceBox
            value="new"
            label="New campaign"
            description="Set dates and a budget now."
          />
        )}
      </RadioGroup>
      {form.campaign_mode === "existing" && (
        <div className="flex flex-col gap-y-2">
          <FieldLabel htmlFor="promotion-campaign">Campaign</FieldLabel>
          <Select
            value={form.campaign_id}
            onValueChange={(campaign_id) => onChange({ campaign_id })}
          >
            <Select.Trigger id="promotion-campaign">
              <Select.Value placeholder="Choose a campaign" />
            </Select.Trigger>
            <Select.Content>
              {campaigns.map((campaign) => (
                <Select.Item key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </div>
      )}
      {form.campaign_mode === "new" && (
        <CampaignFields
          idPrefix="new-campaign"
          campaign={form.campaign}
          currencyCode={form.currency_code}
          onChange={(update) =>
            onChange({ campaign: { ...form.campaign, ...update } })
          }
        />
      )}
    </div>
  )
}
