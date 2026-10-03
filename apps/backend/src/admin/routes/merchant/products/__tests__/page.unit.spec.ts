import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("merchant product management regression", () => {
  it("uses a Medusa-style multi-step creation focus modal", () => {
    const source = readFileSync(
      resolve(__dirname, "../product-create-modal.tsx"),
      "utf8"
    )

    expect(source).toContain("<FocusModal")
    expect(source).toContain("<ProgressTabs")
    expect(source).toContain('"details", "organize", "variants"')
    expect(source).toContain("buildVariants")
    expect(source).toContain("Publish product")
    expect(source).toContain('className="flex min-h-0 flex-1 flex-col overflow-hidden"')
    expect(source).toContain('capture="environment"')
    expect(source).toContain("merchantApi.upload")
    expect(source).toContain("Upload photos")
    expect(source).toContain("Take photo")
    expect(source).toContain('merchantApi.get<MerchantDeliverySettings>')
    expect(source).toContain("Required to publish")
    expect(source).toContain("price for every variant before publishing")
    expect(source).not.toContain('currencyCode: "kes"')
    expect(source).not.toContain("@medusajs/dashboard/")
    expect(source).not.toContain("sdk.admin.upload")
  })

  it("drafts details from a photo without overwriting the merchant's input", () => {
    const source = readFileSync(
      resolve(__dirname, "../product-create-modal.tsx"),
      "utf8"
    )
    const apiClient = readFileSync(
      resolve(__dirname, "../../../../lib/merchant-api.ts"),
      "utf8"
    )

    // Drafts from every photo (thumbnail first) and redrafts only while the
    // drafted text is untouched.
    expect(source).toContain("draftFromPhotos.mutate(draftPhotos)")
    expect(source).toContain("selectDraftPhotos(nextMedia)")
    expect(source).toContain("draftTextUntouched && addsDraftPhotos")
    expect(source).toContain("if (!title.trim() || title === draftedTitle)")
    expect(source).toContain("Update from all photos")
    expect(source).toContain("photoDraftsEnabled && mediaFiles.length > 0")
    expect(source).toContain("Use these options")
    expect(source).toContain(".slice(0, 3)")
    expect(source).toContain("resizeImageForDraft(file)")
    expect(source).toContain("description_source:")
    // Each variant can show its own photos on the storefront.
    expect(source).toContain("Photos for this variant")
    expect(source).toContain("image_urls: imageUrls")
    expect(source).toContain("suggestImageKeys(combination, photoLinks)")
    expect(apiClient).toContain("`/admin/merchants/${merchantId}/product-drafts`")
    expect(apiClient).toContain('body.append("photos", photo)')
  })

  it("loads the catalog with server-side pagination and filters", () => {
    const source = readFileSync(resolve(__dirname, "../page.tsx"), "utf8")

    expect(source).toContain("DataTablePaginationState")
    expect(source).toContain("<DataTable.Pagination />")
    expect(source).toContain('params.set("q", search.trim())')
    expect(source).toContain('params.set("status", status)')
    expect(source).not.toContain("values.filter((product)")
  })

  it("edits existing product sections in drawers", () => {
    const page = readFileSync(resolve(__dirname, "../[id]/page.tsx"), "utf8")
    const drawers = readFileSync(
      resolve(__dirname, "../[id]/product-edit-drawers.tsx"),
      "utf8"
    )

    expect(page).toContain("GeneralEditDrawer")
    expect(page).toContain("OrganizationEditDrawer")
    expect(page).toContain("VariantsEditDrawer")
    expect(drawers).toContain("FormEvent<HTMLFormElement>")
    expect(drawers).toContain("event.preventDefault()")
    expect(drawers).toContain("new FormData(event.currentTarget)")
    expect(drawers).toContain("storefront prices")
    expect(drawers).not.toContain('?? "kes"')
    expect(page).toContain("MediaEditDrawer merchantId={session.merchant.id}")
    expect(drawers).toContain("merchantApi.upload(merchantId, files)")
    expect(drawers).toContain("Make thumbnail")
    expect(drawers).not.toContain("Image URLs")
    expect(drawers).toContain('shippingProfileId === "default" ? null')
  })

  it("keeps the shipping profile unless an update changes it", () => {
    const workflow = readFileSync(
      resolve(__dirname, "../../../../../workflows/merchant-catalog.ts"),
      "utf8"
    )
    const middleware = readFileSync(
      resolve(
        __dirname,
        "../../../../../api/admin/merchants/[merchantId]/products/middlewares.ts"
      ),
      "utf8"
    )

    expect(workflow).toContain("shippingProfileId !== undefined")
    expect(middleware).toContain(
      "shipping_profile_id: z.string().min(1).nullable().optional()"
    )
  })

  it("validates and authorizes catalog mutations in workflows", () => {
    const workflow = readFileSync(
      resolve(__dirname, "../../../../../workflows/merchant-catalog.ts"),
      "utf8"
    )
    const middleware = readFileSync(
      resolve(
        __dirname,
        "../../../../../api/admin/merchants/[merchantId]/products/middlewares.ts"
      ),
      "utf8"
    )
    const uploadRoute = readFileSync(
      resolve(
        __dirname,
        "../../../../../api/admin/merchants/[merchantId]/uploads/route.ts"
      ),
      "utf8"
    )
    const uploadMiddleware = readFileSync(
      resolve(
        __dirname,
        "../../../../../api/admin/merchants/[merchantId]/uploads/middlewares.ts"
      ),
      "utf8"
    )
    const apiClient = readFileSync(
      resolve(__dirname, "../../../../lib/merchant-api.ts"),
      "utf8"
    )

    expect(workflow).toContain("validateMerchantCatalogMutationAccessStep")
    expect(workflow).toContain('allowed_roles: ["owner", "admin"]')
    expect(workflow).toContain("createProductsWorkflow.runAsStep")
    expect(workflow).toContain("updateProductsWorkflow.runAsStep")
    expect(workflow).toContain("uploadFilesWorkflow.runAsStep")
    expect(workflow).toContain("validateMerchantProductMediaStep")
    expect(workflow).toContain("validateMerchantPublishedProductPricesStep")
    expect(workflow).toContain("needs ${missingCurrencies")
    expect(middleware).toContain("CreateMerchantProductsSchema")
    expect(middleware).toContain("UpdateMerchantProductSchema")
    expect(middleware).toContain("ListMerchantProductsSchema")
    expect(uploadRoute).toContain("getMerchantRouteScope(request)")
    expect(uploadRoute).toContain("request.auth_context.actor_id")
    expect(uploadMiddleware).toContain('["owner", "admin"]')
    expect(apiClient).toContain(
      "`/admin/merchants/${merchantId}/uploads`"
    )
    expect(apiClient).not.toContain("sdk.admin.upload.create")
  })
})
