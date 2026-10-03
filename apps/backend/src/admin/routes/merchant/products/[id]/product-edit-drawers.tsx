import {
  ArrowDownMini,
  ArrowUpMini,
  ArrowUpTray,
  Camera,
  Trash,
} from "@medusajs/icons"
import {
  Avatar,
  Button,
  Checkbox,
  Drawer,
  IconButton,
  InlineTip,
  Input,
  Label,
  Select,
  Switch,
  Text,
  Textarea,
} from "@medusajs/ui"
import { useMutation } from "@tanstack/react-query"
import { FormEvent, useEffect, useRef, useState } from "react"

import {
  errorMessage,
  merchantApi,
  type MerchantProduct,
} from "../../../../lib/merchant-api"
import {
  formatFileSize,
  MAX_PRODUCT_IMAGES,
  SUPPORTED_IMAGE_ACCEPT,
  validateImageFiles,
} from "../../../../lib/product-media"

type ReferenceData = {
  categories: Array<{ id: string; name: string }>
  collections: Array<{ id: string; title: string }>
  shippingProfiles: Array<{ id: string; name: string; type: string }>
}

type DrawerProps = {
  product: MerchantProduct
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (update: Record<string, unknown>) => void
  isPending: boolean
}

export const GeneralEditDrawer = ({
  product,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: DrawerProps) => {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSubmit({
      title: String(formData.get("title") ?? "").trim(),
      subtitle: String(formData.get("subtitle") ?? "").trim() || null,
      handle: String(formData.get("handle") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim() || null,
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Edit general information</Drawer.Title>
            <Drawer.Description>Update the customer-facing product details.</Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-2"><Label htmlFor="edit-product-title">Title</Label><Input id="edit-product-title" name="title" defaultValue={product.title} required /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="edit-product-subtitle">Subtitle</Label><Input id="edit-product-subtitle" name="subtitle" defaultValue={product.subtitle ?? ""} /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="edit-product-handle">Handle</Label><Input id="edit-product-handle" name="handle" defaultValue={product.handle} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></div>
            <div className="flex flex-col gap-2"><Label htmlFor="edit-product-description">Description</Label><Textarea id="edit-product-description" name="description" defaultValue={product.description ?? ""} rows={8} /></div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild><Button size="small" variant="secondary" type="button" disabled={isPending}>Cancel</Button></Drawer.Close>
            <Button size="small" type="submit" isLoading={isPending} disabled={isPending}>Save</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

type MediaItem = {
  key: string
  url: string
  file?: File
  isThumbnail: boolean
}

const imageName = (url: string) => {
  try {
    const path = new URL(url, window.location.origin).pathname
    return decodeURIComponent(path.split("/").pop() || "Image")
  } catch {
    return "Image"
  }
}

const initialMedia = (product: MerchantProduct): MediaItem[] => {
  const items: MediaItem[] = (product.images ?? []).map(({ id, url }) => ({
    key: id,
    url,
    isThumbnail: false,
  }))
  if (product.thumbnail && !items.some(({ url }) => url === product.thumbnail)) {
    items.unshift({ key: "thumbnail", url: product.thumbnail, isThumbnail: false })
  }
  const thumbnailIndex = Math.max(
    items.findIndex(({ url }) => url === product.thumbnail),
    0
  )

  return items.map((item, index) => ({
    ...item,
    isThumbnail: index === thumbnailIndex,
  }))
}

export const MediaEditDrawer = ({
  merchantId,
  product,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: DrawerProps & { merchantId: string }) => {
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const [media, setMedia] = useState(() => initialMedia(product))
  const [error, setError] = useState("")
  const mediaRef = useRef(media)
  mediaRef.current = media
  const upload = useMutation({
    mutationFn: (files: File[]) => merchantApi.upload(merchantId, files),
  })
  const busy = isPending || upload.isPending

  useEffect(() => () => {
    mediaRef.current.forEach(({ file, url }) => {
      if (file) URL.revokeObjectURL(url)
    })
  }, [])

  const addMedia = (files: File[]) => {
    if (!files.length) return
    const validationError = validateImageFiles(files, media.length)
    if (validationError) {
      setError(validationError)
      return
    }

    setError("")
    setMedia((current) => {
      const hasThumbnail = current.some(({ isThumbnail }) => isThumbnail)

      return [
        ...current,
        ...files.map((file, index) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Date.now()}-${index}`,
          url: URL.createObjectURL(file),
          file,
          isThumbnail: !hasThumbnail && index === 0,
        })),
      ]
    })
  }

  const removeMedia = (key: string) => {
    setMedia((current) => {
      const removed = current.find((item) => item.key === key)
      const remaining = current.filter((item) => item.key !== key)
      if (removed?.file) URL.revokeObjectURL(removed.url)
      if (removed?.isThumbnail && remaining[0]) {
        remaining[0] = { ...remaining[0], isThumbnail: true }
      }
      return remaining
    })
  }

  const moveMedia = (index: number, offset: number) => {
    setMedia((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(index + offset, 0, item)
      return next
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    let items = media
    const newItems = items.filter(({ file }) => file)

    if (newItems.length) {
      try {
        const { files } = await upload.mutateAsync(newItems.map(({ file }) => file!))
        if (files.length !== newItems.length) {
          throw new Error("Some images could not be uploaded")
        }
        const uploadedUrls = new Map(newItems.map(({ key }, index) => [key, files[index].url]))
        items = items.map((item) => {
          const uploadedUrl = uploadedUrls.get(item.key)
          if (!uploadedUrl) return item
          URL.revokeObjectURL(item.url)
          return { key: item.key, url: uploadedUrl, isThumbnail: item.isThumbnail }
        })
        // Keep uploaded URLs so a retry after a failed save does not upload twice.
        setMedia(items)
      } catch (uploadError) {
        setError(errorMessage(uploadError))
        return
      }
    }

    const images = items.map(({ url }) => ({ url }))
    onSubmit({
      thumbnail: items.find(({ isThumbnail }) => isThumbnail)?.url ?? images[0]?.url ?? null,
      images,
    })
  }

  return (
    <Drawer open={open} onOpenChange={(nextOpen) => !busy && onOpenChange(nextOpen)}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Edit media</Drawer.Title>
            <Drawer.Description>Upload, order, and choose the thumbnail for product images.</Drawer.Description>
          </Drawer.Header>
          <Drawer.Body
            className="flex flex-1 flex-col gap-4 overflow-y-auto"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              if (!busy) addMedia(Array.from(event.dataTransfer.files))
            }}
          >
            {error && <InlineTip variant="error" label="Media could not be saved">{error}</InlineTip>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                JPEG, PNG, WebP, or AVIF. Up to 10 MB per image, {MAX_PRODUCT_IMAGES} images per product.
              </Text>
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
                <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => uploadInputRef.current?.click()}>
                  <ArrowUpTray /> Upload photos
                </Button>
                <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => cameraInputRef.current?.click()}>
                  <Camera /> Take photo
                </Button>
              </div>
            </div>
            {media.length === 0 ? (
              <button
                type="button"
                className="border-ui-border-strong bg-ui-bg-subtle text-ui-fg-subtle hover:bg-ui-bg-subtle-hover flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed"
                disabled={busy}
                onClick={() => uploadInputRef.current?.click()}
              >
                <ArrowUpTray />
                <Text size="small">Choose or drop product images</Text>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                {media.map((item, index) => (
                  <div key={item.key} className="bg-ui-bg-component flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar src={item.url} fallback="Image" variant="squared" size="large" />
                      <div className="min-w-0">
                        <Text size="small" weight="plus" className="truncate">{item.file?.name ?? imageName(item.url)}</Text>
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {[
                            item.isThumbnail ? "Thumbnail" : "",
                            item.file ? `New, ${formatFileSize(item.file.size)}` : "",
                          ].filter(Boolean).join(" · ") || `Image ${index + 1}`}
                        </Text>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {!item.isThumbnail && (
                        <Button
                          type="button"
                          size="small"
                          variant="transparent"
                          disabled={busy}
                          onClick={() => setMedia((current) => current.map((entry) => ({
                            ...entry,
                            isThumbnail: entry.key === item.key,
                          })))}
                        >
                          Make thumbnail
                        </Button>
                      )}
                      <IconButton type="button" size="small" variant="transparent" aria-label="Move up" disabled={busy || index === 0} onClick={() => moveMedia(index, -1)}>
                        <ArrowUpMini />
                      </IconButton>
                      <IconButton type="button" size="small" variant="transparent" aria-label="Move down" disabled={busy || index === media.length - 1} onClick={() => moveMedia(index, 1)}>
                        <ArrowDownMini />
                      </IconButton>
                      <IconButton type="button" size="small" variant="transparent" aria-label="Remove image" disabled={busy} onClick={() => removeMedia(item.key)}>
                        <Trash />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild><Button size="small" variant="secondary" type="button" disabled={busy}>Cancel</Button></Drawer.Close>
            <Button size="small" type="submit" isLoading={busy} disabled={busy}>Save</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

export const OrganizationEditDrawer = ({
  product,
  references,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: DrawerProps & { references: ReferenceData }) => {
  const [status, setStatus] = useState(product.status)
  const [collectionId, setCollectionId] = useState(product.collection_id ?? "none")
  const [shippingProfileId, setShippingProfileId] = useState(product.shipping_profile?.id ?? "default")
  const [categoryIds, setCategoryIds] = useState((product.categories ?? []).map(({ id }) => id))
  const [discountable, setDiscountable] = useState(product.discountable !== false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit({
      status,
      collection_id: collectionId === "none" ? null : collectionId,
      shipping_profile_id: shippingProfileId === "default" ? null : shippingProfileId,
      category_ids: categoryIds,
      discountable,
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Edit organization</Drawer.Title>
            <Drawer.Description>Control publication, merchandising, and fulfillment.</Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-5 overflow-y-auto">
            <div className="flex flex-col gap-2"><Label>Status</Label><Select value={status} onValueChange={(value) => setStatus(value as MerchantProduct["status"])}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content><Select.Item value="draft">Draft</Select.Item><Select.Item value="published">Published</Select.Item><Select.Item value="proposed">Proposed</Select.Item><Select.Item value="rejected">Rejected</Select.Item></Select.Content></Select></div>
            <div className="flex flex-col gap-2"><Label>Collection</Label><Select value={collectionId} onValueChange={setCollectionId}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content><Select.Item value="none">No collection</Select.Item>{references.collections.map((collection) => <Select.Item key={collection.id} value={collection.id}>{collection.title}</Select.Item>)}</Select.Content></Select></div>
            <div className="flex flex-col gap-2"><Label>Shipping profile</Label><Select value={shippingProfileId} onValueChange={setShippingProfileId}><Select.Trigger><Select.Value /></Select.Trigger><Select.Content><Select.Item value="default">Merchant default</Select.Item>{references.shippingProfiles.map((profile) => <Select.Item key={profile.id} value={profile.id}>{profile.name}</Select.Item>)}</Select.Content></Select></div>
            <div className="flex flex-col gap-2"><Label>Categories</Label><div className="grid max-h-64 gap-2 overflow-y-auto rounded-lg border p-4">{references.categories.length ? references.categories.map((category) => <div key={category.id} className="flex items-center gap-2"><Checkbox checked={categoryIds.includes(category.id)} onCheckedChange={(checked) => setCategoryIds((current) => checked === true ? [...current, category.id] : current.filter((id) => id !== category.id))} /><Text size="small">{category.name}</Text></div>) : <Text size="small" className="text-ui-fg-subtle">No categories have been created.</Text>}</div></div>
            <div className="flex items-center justify-between rounded-lg border p-4"><div><Text size="small" weight="plus">Discountable</Text><Text size="small" className="text-ui-fg-subtle">Allow promotions on this product.</Text></div><Switch checked={discountable} onCheckedChange={setDiscountable} /></div>
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild><Button size="small" variant="secondary" type="button" disabled={isPending}>Cancel</Button></Drawer.Close>
            <Button size="small" type="submit" isLoading={isPending} disabled={isPending}>Save</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

export const VariantsEditDrawer = ({
  product,
  currencies,
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: DrawerProps & { currencies: string[] }) => {
  const currencyCodes = Array.from(new Set([
    ...currencies.map((currencyCode) => currencyCode.toLowerCase()),
    ...(product.variants ?? []).flatMap((variant) => {
      return (variant.prices ?? []).map(({ currency_code }) => {
        return currency_code.toLowerCase()
      })
    }),
  ]))
  const [flags, setFlags] = useState(() => Object.fromEntries(
    (product.variants ?? []).map((variant) => [variant.id, {
      manageInventory: variant.manage_inventory === true,
      allowBackorder: variant.allow_backorder === true,
    }])
  ))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    onSubmit({
      variants: (product.variants ?? []).map((variant) => {
        const optionValues = Object.fromEntries(
          (product.options ?? []).map((option) => [
            option.title,
            variant.options?.find(({ option: variantOption }) => variantOption?.id === option.id)?.value ?? "",
          ])
        )

        return {
          id: variant.id,
          title: String(formData.get(`title_${variant.id}`) ?? "").trim(),
          sku: String(formData.get(`sku_${variant.id}`) ?? "").trim() || null,
          manage_inventory: flags[variant.id]?.manageInventory === true,
          allow_backorder: flags[variant.id]?.allowBackorder === true,
          options: optionValues,
          prices: currencyCodes.flatMap((currencyCode) => {
            const amount = String(
              formData.get(`price_${variant.id}_${currencyCode}`) ?? ""
            ).trim()
            if (!amount) return []

            return [{
              id: variant.prices?.find((price) => {
                return price.currency_code.toLowerCase() === currencyCode
              })?.id,
              amount: Number(amount),
              currency_code: currencyCode,
            }]
          }),
        }
      }),
    })
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <form className="flex h-full flex-col" onSubmit={handleSubmit}>
          <Drawer.Header>
            <Drawer.Title>Edit variants</Drawer.Title>
            <Drawer.Description>Update variant identity, storefront prices, and inventory behavior.</Drawer.Description>
          </Drawer.Header>
          <Drawer.Body className="flex flex-1 flex-col gap-3 overflow-y-auto">
            {(product.variants ?? []).map((variant) => (
              <div key={variant.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
                <div className="flex flex-col gap-2"><Label htmlFor={`variant-title-${variant.id}`}>Title</Label><Input id={`variant-title-${variant.id}`} name={`title_${variant.id}`} defaultValue={variant.title} required /></div>
                <div className="flex flex-col gap-2"><Label htmlFor={`variant-sku-${variant.id}`}>SKU</Label><Input id={`variant-sku-${variant.id}`} name={`sku_${variant.id}`} defaultValue={variant.sku ?? ""} /></div>
                {currencyCodes.map((currencyCode) => {
                  const price = variant.prices?.find((candidate) => {
                    return candidate.currency_code.toLowerCase() === currencyCode
                  })
                  const isStorefrontCurrency = currencies.includes(currencyCode)

                  return (
                    <div key={currencyCode} className="flex flex-col gap-2">
                      <Label htmlFor={`variant-price-${variant.id}-${currencyCode}`}>
                        {currencyCode.toUpperCase()} price
                      </Label>
                      <Input
                        id={`variant-price-${variant.id}-${currencyCode}`}
                        name={`price_${variant.id}_${currencyCode}`}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={price?.amount ?? ""}
                        required={product.status === "published" && isStorefrontCurrency}
                      />
                    </div>
                  )
                })}
                <div className="flex items-center gap-2"><Checkbox checked={flags[variant.id]?.manageInventory === true} onCheckedChange={(checked) => setFlags((current) => ({ ...current, [variant.id]: { ...current[variant.id], manageInventory: checked === true } }))} /><Text size="small">Manage inventory</Text></div>
                <div className="flex items-center gap-2"><Checkbox checked={flags[variant.id]?.allowBackorder === true} onCheckedChange={(checked) => setFlags((current) => ({ ...current, [variant.id]: { ...current[variant.id], allowBackorder: checked === true } }))} /><Text size="small">Allow backorder</Text></div>
              </div>
            ))}
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild><Button size="small" variant="secondary" type="button" disabled={isPending}>Cancel</Button></Drawer.Close>
            <Button size="small" type="submit" isLoading={isPending} disabled={isPending}>Save variants</Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}
