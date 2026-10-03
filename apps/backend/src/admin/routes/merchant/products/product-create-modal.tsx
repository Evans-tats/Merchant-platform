import { ArrowUpTray, Camera, PlusMini, Trash } from "@medusajs/icons"
import {
  Avatar,
  Button,
  Checkbox,
  FocusModal,
  InlineTip,
  Input,
  Label,
  ProgressTabs,
  Select,
  Switch,
  Text,
  Textarea,
  toast,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantDeliverySettings,
  type MerchantProduct,
  type MerchantSession,
} from "../../../lib/merchant-api"
import {
  formatFileSize,
  SUPPORTED_IMAGE_ACCEPT,
  validateImageFiles,
} from "../../../lib/product-media"

type Step = "details" | "organize" | "variants"
type ProductOptionDraft = { key: string; title: string; values: string }
type ProductVariantDraft = {
  key: string
  title: string
  sku: string
  prices: Record<string, string>
  manageInventory: boolean
  allowBackorder: boolean
  options: Record<string, string>
}

type ProductMediaDraft = {
  key: string
  file: File
  previewUrl: string
  isThumbnail: boolean
}

type ReferenceData = {
  categories: Array<{ id: string; name: string }>
  collections: Array<{ id: string; title: string }>
  shippingProfiles: Array<{ id: string; name: string; type: string }>
  regions: MerchantDeliverySettings["regions"]
}

const stepOrder: Step[] = ["details", "organize", "variants"]

const slugify = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "")

const splitValues = (value: string) => Array.from(new Set(
  value.split(",").map((entry) => entry.trim()).filter(Boolean)
))

const buildVariants = (
  hasVariants: boolean,
  options: ProductOptionDraft[],
  previous: ProductVariantDraft[],
  currencyCodes: string[]
) => {
  const normalized = hasVariants
    ? options.map((option) => ({
        title: option.title.trim(),
        values: splitValues(option.values),
      }))
    : [{ title: "Default", values: ["Default"] }]
  const combinations = normalized.reduce<Array<Record<string, string>>>(
    (entries, option) => entries.flatMap((entry) =>
      option.values.map((value) => ({ ...entry, [option.title]: value }))
    ),
    [{}]
  )

  return combinations.map((combination) => {
    const title = Object.values(combination).join(" / ") || "Default"
    const key = Object.entries(combination)
      .map(([name, value]) => `${name}:${value}`)
      .join("|")
    const existing = previous.find((variant) => variant.key === key)

    if (existing) {
      return {
        ...existing,
        prices: Object.fromEntries(currencyCodes.map((currencyCode) => [
          currencyCode,
          existing.prices[currencyCode] ?? "",
        ])),
      }
    }

    return {
      key,
      title,
      sku: "",
      prices: Object.fromEntries(currencyCodes.map((currencyCode) => [
        currencyCode,
        "",
      ])),
      manageInventory: true,
      allowBackorder: false,
      options: combination,
    }
  })
}

export const ProductCreateModal = ({
  session,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("details")
  const [error, setError] = useState("")
  const [title, setTitle] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [handle, setHandle] = useState("")
  const [description, setDescription] = useState("")
  const [mediaFiles, setMediaFiles] = useState<ProductMediaDraft[]>([])
  const [hasVariants, setHasVariants] = useState(false)
  const [options, setOptions] = useState<ProductOptionDraft[]>([
    { key: "option-1", title: "Size", values: "" },
  ])
  const [collectionId, setCollectionId] = useState("none")
  const [shippingProfileId, setShippingProfileId] = useState("default")
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [discountable, setDiscountable] = useState(true)
  const [variants, setVariants] = useState<ProductVariantDraft[]>([])

  const referencesQuery = useQuery({
    queryKey: merchantQueryKeys.resource(
      session.merchant.id,
      "product-create-references"
    ),
    queryFn: async (): Promise<ReferenceData> => {
      const [categories, collections, deliverySettings] = await Promise.all([
        merchantApi.get<{
          product_categories: ReferenceData["categories"]
        }>(session.merchant.id, "/categories"),
        merchantApi.get<{
          collections: ReferenceData["collections"]
        }>(session.merchant.id, "/collections"),
        merchantApi.get<MerchantDeliverySettings>(
          session.merchant.id,
          "/delivery-options"
        ),
      ])

      return {
        categories: categories.product_categories,
        collections: collections.collections,
        shippingProfiles: deliverySettings.shipping_profiles,
        regions: deliverySettings.regions,
      }
    },
    enabled: open,
  })
  const currencyCodes = Array.from(new Set(
    (referencesQuery.data?.regions ?? []).map(({ currency_code }) => {
      return currency_code.toLowerCase()
    })
  ))

  const reset = () => {
    setStep("details")
    setError("")
    setTitle("")
    setSubtitle("")
    setHandle("")
    setDescription("")
    setMediaFiles((current) => {
      current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl))
      return []
    })
    setHasVariants(false)
    setOptions([{ key: "option-1", title: "Size", values: "" }])
    setCollectionId("none")
    setShippingProfileId("default")
    setCategoryIds([])
    setDiscountable(true)
    setVariants([])
  }

  const createProduct = useMutation({
    mutationFn: async (status: MerchantProduct["status"]) => {
      const productOptions = hasVariants
        ? options.map((option) => ({
            title: option.title.trim(),
            values: splitValues(option.values),
          }))
        : [{ title: "Default", values: ["Default"] }]
      const thumbnailFile = mediaFiles.find(({ isThumbnail }) => isThumbnail)
      const otherFiles = mediaFiles.filter(({ isThumbnail }) => !isThumbnail)
      const [thumbnailUpload, otherUploads] = await Promise.all([
        thumbnailFile
          ? merchantApi.upload(session.merchant.id, [thumbnailFile.file])
          : Promise.resolve({ files: [] }),
        otherFiles.length
          ? merchantApi.upload(
              session.merchant.id,
              otherFiles.map(({ file }) => file)
            )
          : Promise.resolve({ files: [] }),
      ])
      const uploadedThumbnail = thumbnailUpload.files[0]?.url
      const images = [...thumbnailUpload.files, ...otherUploads.files]
        .map(({ url }) => ({ url }))

      return merchantApi.post<{ products: MerchantProduct[] }>(
        session.merchant.id,
        "/products",
        {
          products: [{
            title: title.trim(),
            handle: handle.trim() || slugify(title),
            subtitle: subtitle.trim() || null,
            description: description.trim() || null,
            thumbnail: uploadedThumbnail || images[0]?.url || null,
            images,
            status,
            discountable,
            collection_id: collectionId === "none" ? null : collectionId,
            shipping_profile_id:
              shippingProfileId === "default" ? undefined : shippingProfileId,
            category_ids: categoryIds,
            options: productOptions,
            variants: variants.map((variant) => ({
              title: variant.title.trim(),
              sku: variant.sku.trim() || undefined,
              manage_inventory: variant.manageInventory,
              allow_backorder: variant.allowBackorder,
              options: variant.options,
              prices: Object.entries(variant.prices)
                .filter(([, amount]) => amount.trim() !== "")
                .map(([currencyCode, amount]) => ({
                  amount: Number(amount),
                  currency_code: currencyCode,
                })),
            })),
          }],
        }
      )
    },
    onSuccess: async ({ products }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(session.merchant.id, "products"),
        }),
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.dashboard(session.merchant.id),
        }),
      ])
      toast.success("Product created")
      onOpenChange(false)
      reset()
      if (products[0]) {
      navigate(`/merchant-products/${products[0].id}`)
      }
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  })

  const validateDetails = () => {
    if (!title.trim()) return "Enter a product title"
    if (handle.trim() && slugify(handle) !== handle.trim()) {
      return "Handle can only contain lowercase letters, numbers, and hyphens"
    }
    if (hasVariants) {
      const normalized = options.map((option) => ({
        title: option.title.trim(),
        values: splitValues(option.values),
      }))
      if (normalized.some((option) => !option.title || !option.values.length)) {
        return "Each product option needs a title and at least one value"
      }
      if (new Set(normalized.map(({ title: optionTitle }) => optionTitle.toLowerCase())).size !== normalized.length) {
        return "Product option titles must be unique"
      }
      const variantCount = normalized.reduce(
        (count, option) => count * option.values.length,
        1
      )
      if (variantCount > 100) return "Limit the product to 100 variants"
    }
    return ""
  }

  const goTo = (nextStep: Step) => {
    if (step === "details" && nextStep !== "details") {
      const validationError = validateDetails()
      if (validationError) {
        setError(validationError)
        return
      }
    }
    if (nextStep === "variants") {
      if (!currencyCodes.length) {
        setError(
          "No storefront currency is configured. Add a region before creating products."
        )
        return
      }
      setVariants((current) => buildVariants(
        hasVariants,
        options,
        current,
        currencyCodes
      ))
    }
    setError("")
    setStep(nextStep)
  }

  const submit = (status: MerchantProduct["status"]) => {
    if (!variants.length) {
      setError("Configure at least one variant")
      return
    }
    const missingPrice = status === "published" && variants.some((variant) => {
      return currencyCodes.some((currencyCode) => {
        return !variant.prices[currencyCode]?.trim()
      })
    })
    if (missingPrice) {
      setError(
        `Enter a ${currencyCodes.map((code) => code.toUpperCase()).join(" and ")} price for every variant before publishing`
      )
      return
    }
    const invalidPrice = variants.some((variant) => {
      return Object.values(variant.prices).some((price) => {
        return price.trim() !== "" && (
          !Number.isFinite(Number(price)) || Number(price) < 0
        )
      })
    })
    if (invalidPrice) {
      setError("Variant prices must be zero or greater")
      return
    }
    createProduct.mutate(status)
  }

  const addMedia = (files: File[]) => {
    const validationError = validateImageFiles(files, mediaFiles.length)
    if (validationError) {
      setError(validationError)
      return
    }

    setError("")
    setMediaFiles((current) => {
      const hasThumbnail = current.some(({ isThumbnail }) => isThumbnail)

      return [
        ...current,
        ...files.map((file, index) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
          file,
          previewUrl: URL.createObjectURL(file),
          isThumbnail: !hasThumbnail && index === 0,
        })),
      ]
    })
  }

  const removeMedia = (key: string) => {
    setMediaFiles((current) => {
      const removed = current.find((entry) => entry.key === key)
      const remaining = current.filter((entry) => entry.key !== key)
      if (removed) URL.revokeObjectURL(removed.previewUrl)
      if (removed?.isThumbnail && remaining[0]) {
        remaining[0] = { ...remaining[0], isThumbnail: true }
      }
      return remaining
    })
  }

  const completedIndex = stepOrder.indexOf(step)

  return (
    <FocusModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createProduct.isPending) {
          onOpenChange(nextOpen)
          if (!nextOpen) reset()
        }
      }}
    >
      <FocusModal.Content>
        <FocusModal.Title asChild>
          <span className="sr-only">Create product</span>
        </FocusModal.Title>
        <FocusModal.Description asChild>
          <span className="sr-only">
            Add product details, organization, variants, prices, and inventory behavior.
          </span>
        </FocusModal.Description>
        <ProgressTabs
          value={step}
          onValueChange={(value) => goTo(value as Step)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <FocusModal.Header>
            <div className="-my-2 w-full border-l">
              <ProgressTabs.List className="flex w-full items-center justify-start">
                {stepOrder.map((value, index) => (
                  <ProgressTabs.Trigger
                    key={value}
                    value={value}
                    disabled={index > completedIndex + 1}
                    status={index < completedIndex ? "completed" : index === completedIndex ? "in-progress" : "not-started"}
                  >
                    {value === "details" ? "Details" : value === "organize" ? "Organize" : "Variants"}
                  </ProgressTabs.Trigger>
                ))}
              </ProgressTabs.List>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="min-h-0 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 py-8">
              {error && <InlineTip variant="error" label="Product could not be saved">{error}</InlineTip>}
              {referencesQuery.isError && (
                <InlineTip variant="error" label="Reference data unavailable">
                  {errorMessage(referencesQuery.error)}
                </InlineTip>
              )}

              <ProgressTabs.Content value="details" className="flex flex-col gap-6">
                <div>
                  <Text size="large" weight="plus">Product details</Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    Add the information and media customers need to choose this product.
                  </Text>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <Label htmlFor="create-product-title">Title</Label>
                    <Input id="create-product-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="create-product-subtitle">Subtitle</Label>
                    <Input id="create-product-subtitle" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="create-product-handle">Handle</Label>
                    <Input id="create-product-handle" value={handle} onChange={(event) => setHandle(event.target.value)} placeholder={slugify(title) || "linen-shirt"} />
                  </div>
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <Label htmlFor="create-product-description">Description</Label>
                    <Textarea id="create-product-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={5} />
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <Text size="small" weight="plus">Media</Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        JPEG, PNG, WebP, or AVIF. Up to 10 MB per image.
                      </Text>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        ref={uploadInputRef}
                        className="hidden"
                        type="file"
                        accept={SUPPORTED_IMAGE_ACCEPT}
                        multiple
                        onChange={(event) => {
                          addMedia(Array.from(event.currentTarget.files ?? []))
                          event.currentTarget.value = ""
                        }}
                      />
                      <input
                        ref={cameraInputRef}
                        className="hidden"
                        type="file"
                        accept={SUPPORTED_IMAGE_ACCEPT}
                        capture="environment"
                        onChange={(event) => {
                          addMedia(Array.from(event.currentTarget.files ?? []))
                          event.currentTarget.value = ""
                        }}
                      />
                      <Button
                        type="button"
                        size="small"
                        variant="secondary"
                        onClick={() => uploadInputRef.current?.click()}
                      >
                        <ArrowUpTray /> Upload photos
                      </Button>
                      <Button
                        type="button"
                        size="small"
                        variant="secondary"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera /> Take photo
                      </Button>
                    </div>
                  </div>
                  {mediaFiles.length === 0 ? (
                    <button
                      type="button"
                      className="border-ui-border-strong bg-ui-bg-subtle text-ui-fg-subtle hover:bg-ui-bg-subtle-hover flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed"
                      onClick={() => uploadInputRef.current?.click()}
                    >
                      <ArrowUpTray />
                      <Text size="small">Choose product images</Text>
                    </button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {mediaFiles.map((entry) => (
                        <div key={entry.key} className="bg-ui-bg-component flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                          <div className="flex min-w-0 items-center gap-3">
                            <Avatar src={entry.previewUrl} fallback="Image" variant="squared" size="large" />
                            <div className="min-w-0">
                              <Text size="small" weight="plus" className="truncate">{entry.file.name}</Text>
                              <Text size="xsmall" className="text-ui-fg-subtle">
                                {entry.isThumbnail ? "Thumbnail - " : ""}{formatFileSize(entry.file.size)}
                              </Text>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {!entry.isThumbnail && (
                              <Button
                                type="button"
                                size="small"
                                variant="transparent"
                                onClick={() => setMediaFiles((current) => current.map((item) => ({
                                  ...item,
                                  isThumbnail: item.key === entry.key,
                                })))}
                              >
                                Make thumbnail
                              </Button>
                            )}
                            <Button type="button" size="small" variant="transparent" onClick={() => removeMedia(entry.key)}>
                              <Trash />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <Text size="small" weight="plus">This product has variants</Text>
                    <Text size="small" className="text-ui-fg-subtle">Create combinations such as size and color.</Text>
                  </div>
                  <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
                </div>
                {hasVariants && (
                  <div className="flex flex-col gap-3">
                    {options.map((option) => (
                      <div key={option.key} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_2fr_auto]">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`option-title-${option.key}`}>Option</Label>
                          <Input id={`option-title-${option.key}`} value={option.title} onChange={(event) => setOptions((current) => current.map((entry) => entry.key === option.key ? { ...entry, title: event.target.value } : entry))} placeholder="Size" />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`option-values-${option.key}`}>Values</Label>
                          <Input id={`option-values-${option.key}`} value={option.values} onChange={(event) => setOptions((current) => current.map((entry) => entry.key === option.key ? { ...entry, values: event.target.value } : entry))} placeholder="Small, Medium, Large" />
                        </div>
                        <Button size="small" variant="transparent" className="self-end" disabled={options.length === 1} onClick={() => setOptions((current) => current.filter((entry) => entry.key !== option.key))}><Trash /></Button>
                      </div>
                    ))}
                    <Button size="small" variant="secondary" className="self-start" disabled={options.length >= 3} onClick={() => setOptions((current) => [...current, { key: `option-${Date.now()}`, title: "", values: "" }])}><PlusMini /> Add option</Button>
                  </div>
                )}
              </ProgressTabs.Content>

              <ProgressTabs.Content value="organize" className="flex flex-col gap-6">
                <div>
                  <Text size="large" weight="plus">Organize product</Text>
                  <Text size="small" className="text-ui-fg-subtle">Control merchandising, tax discounts, and fulfillment.</Text>
                </div>
                {referencesQuery.isPending ? (
                  <Text size="small" className="text-ui-fg-subtle">Loading organization options...</Text>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <Label>Collection</Label>
                      <Select value={collectionId} onValueChange={setCollectionId}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                          <Select.Item value="none">No collection</Select.Item>
                          {(referencesQuery.data?.collections ?? []).map((collection) => <Select.Item key={collection.id} value={collection.id}>{collection.title}</Select.Item>)}
                        </Select.Content>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label>Shipping profile</Label>
                      <Select value={shippingProfileId} onValueChange={setShippingProfileId}>
                        <Select.Trigger><Select.Value /></Select.Trigger>
                        <Select.Content>
                          <Select.Item value="default">Merchant default</Select.Item>
                          {(referencesQuery.data?.shippingProfiles ?? []).map((profile) => <Select.Item key={profile.id} value={profile.id}>{profile.name}</Select.Item>)}
                        </Select.Content>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-2 md:col-span-2">
                      <Label>Categories</Label>
                      <div className="grid max-h-56 gap-2 overflow-y-auto rounded-lg border p-4 md:grid-cols-2">
                        {(referencesQuery.data?.categories ?? []).length ? referencesQuery.data!.categories.map((category) => (
                          <div key={category.id} className="flex items-center gap-2">
                            <Checkbox checked={categoryIds.includes(category.id)} onCheckedChange={(checked) => setCategoryIds((current) => checked === true ? [...current, category.id] : current.filter((id) => id !== category.id))} />
                            <Text size="small">{category.name}</Text>
                          </div>
                        )) : <Text size="small" className="text-ui-fg-subtle">No categories have been created.</Text>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4 md:col-span-2">
                      <div>
                        <Text size="small" weight="plus">Discountable</Text>
                        <Text size="small" className="text-ui-fg-subtle">Allow promotions to apply to this product.</Text>
                      </div>
                      <Switch checked={discountable} onCheckedChange={setDiscountable} />
                    </div>
                  </div>
                )}
              </ProgressTabs.Content>

              <ProgressTabs.Content value="variants" className="flex flex-col gap-6">
                <div>
                  <Text size="large" weight="plus">Variants and prices</Text>
                  <Text size="small" className="text-ui-fg-subtle">Set identity, pricing, and inventory behavior for each variant.</Text>
                </div>
                <div className="flex flex-col gap-3">
                  {variants.map((variant) => (
                    <div key={variant.key} className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="flex flex-col gap-2"><Label>Title</Label><Input value={variant.title} onChange={(event) => setVariants((current) => current.map((entry) => entry.key === variant.key ? { ...entry, title: event.target.value } : entry))} /></div>
                      <div className="flex flex-col gap-2"><Label>SKU</Label><Input value={variant.sku} onChange={(event) => setVariants((current) => current.map((entry) => entry.key === variant.key ? { ...entry, sku: event.target.value } : entry))} /></div>
                      {currencyCodes.map((currencyCode) => (
                        <div key={currencyCode} className="flex flex-col gap-2">
                          <Label>{currencyCode.toUpperCase()} price</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={variant.prices[currencyCode] ?? ""}
                            onChange={(event) => setVariants((current) => current.map((entry) => entry.key === variant.key ? {
                              ...entry,
                              prices: {
                                ...entry.prices,
                                [currencyCode]: event.target.value,
                              },
                            } : entry))}
                            placeholder="Required to publish"
                          />
                        </div>
                      ))}
                      <div className="flex items-center gap-2"><Checkbox checked={variant.manageInventory} onCheckedChange={(checked) => setVariants((current) => current.map((entry) => entry.key === variant.key ? { ...entry, manageInventory: checked === true } : entry))} /><Text size="small">Manage inventory</Text></div>
                      <div className="flex items-center gap-2"><Checkbox checked={variant.allowBackorder} onCheckedChange={(checked) => setVariants((current) => current.map((entry) => entry.key === variant.key ? { ...entry, allowBackorder: checked === true } : entry))} /><Text size="small">Allow backorder</Text></div>
                    </div>
                  ))}
                </div>
              </ProgressTabs.Content>
            </div>
          </FocusModal.Body>
        </ProgressTabs>
        <FocusModal.Footer>
          <div className="flex w-full items-center justify-between">
            <Button size="small" variant="secondary" disabled={createProduct.isPending} onClick={() => {
              const index = stepOrder.indexOf(step)
              if (index === 0) {
                reset()
                onOpenChange(false)
              } else {
                goTo(stepOrder[index - 1])
              }
            }}>{step === "details" ? "Cancel" : "Back"}</Button>
            {step !== "variants" ? (
              <Button size="small" onClick={() => goTo(stepOrder[stepOrder.indexOf(step) + 1])}>Continue</Button>
            ) : (
              <div className="flex gap-2">
                <Button size="small" variant="secondary" disabled={createProduct.isPending} onClick={() => submit("draft")}>Save as draft</Button>
                <Button size="small" isLoading={createProduct.isPending} disabled={createProduct.isPending} onClick={() => submit("published")}>Publish product</Button>
              </div>
            )}
          </div>
        </FocusModal.Footer>
      </FocusModal.Content>
    </FocusModal>
  )
}
