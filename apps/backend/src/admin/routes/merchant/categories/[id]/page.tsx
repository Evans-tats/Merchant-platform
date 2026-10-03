import { EllipsisHorizontal, PencilSquare, Plus, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  DropdownMenu,
  Heading,
  IconButton,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  type FormEvent,
  Fragment,
  type ReactNode,
  useMemo,
  useState,
} from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import { CatalogProductsSection } from "../../../../components/merchant/catalog-products"
import {
  MerchantPageSkeleton,
  MerchantRoute,
} from "../../../../components/merchant/merchant-page"
import { adjustedHandleNotice } from "../../../../lib/handles"
import {
  canManageMerchant,
  errorMessage,
  merchantApi,
  type MerchantCategoryDetail,
  type MerchantCategoryListResponse,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import { CategoryStatusBadges } from "../category-badges"
import {
  categoryFormFrom,
  categoryUpdatePayload,
  hasCategoryFormErrors,
  parentCategoryOptions,
  validateCategoryForm,
  type CategoryFormErrors,
  type CategoryFormValues,
  type CategoryPayload,
} from "../category-form"
import { CategoryFormFields } from "../category-form-fields"
import {
  categoryQueryKeys,
  useInvalidateCategories,
} from "../category-queries"
import { CreateCategoryModal } from "../create-category-modal"

const EditCategoryDrawer = ({
  session,
  category,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  category: MerchantCategoryDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const invalidate = useInvalidateCategories(session.merchant.id)
  const initialValues = categoryFormFrom(category)
  const [values, setValues] = useState<CategoryFormValues>(initialValues)
  const [errors, setErrors] = useState<CategoryFormErrors>({})
  const categoriesQuery = useQuery({
    queryKey: categoryQueryKeys.list(session.merchant.id),
    queryFn: () =>
      merchantApi.get<MerchantCategoryListResponse>(
        session.merchant.id,
        "/categories"
      ),
    enabled: open,
  })
  const parentOptions = useMemo(
    () =>
      parentCategoryOptions(
        categoriesQuery.data?.product_categories ?? [],
        category.id
      ),
    [categoriesQuery.data, category.id]
  )
  const updateCategory = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      merchantApi.post<{ product_category: MerchantCategoryDetail }>(
        session.merchant.id,
        `/categories/${category.id}`,
        payload
      ),
    onSuccess: async ({ product_category: saved }, payload) => {
      await invalidate()
      toast.success("Category updated", {
        description: adjustedHandleNotice(payload.handle, saved.handle),
      })
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateCategoryForm(values)

    setErrors(nextErrors)

    if (!hasCategoryFormErrors(nextErrors)) {
      updateCategory.mutate(categoryUpdatePayload(values))
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        // Closing without saving discards the edits.
        if (!next) {
          setValues(initialValues)
          setErrors({})
        }
        onOpenChange(next)
      }}
    >
      <Drawer.Content>
        <form className="flex h-full flex-col" noValidate onSubmit={submit}>
          <Drawer.Header>
            <Drawer.Title>Edit category</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex-1 overflow-y-auto">
            <CategoryFormFields
              layout="stack"
              values={values}
              errors={errors}
              parentOptions={parentOptions}
              onChange={(change) => {
                setValues((current) => ({ ...current, ...change }))
                setErrors((current) => ({
                  ...current,
                  ...Object.fromEntries(
                    Object.keys(change).map((key) => [key, undefined])
                  ),
                }))
              }}
            />
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button
                size="small"
                variant="secondary"
                type="button"
                disabled={updateCategory.isPending}
              >
                Cancel
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              type="submit"
              isLoading={updateCategory.isPending}
            >
              Save
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const DetailRow = ({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) => (
  <div className="text-ui-fg-subtle grid grid-cols-2 items-start px-6 py-4">
    <Text size="small" leading="compact" weight="plus">
      {label}
    </Text>
    <div className="min-w-0">{children}</div>
  </div>
)

const CategoryDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCategories(session.merchant.id)
  const [editOpen, setEditOpen] = useState(false)
  const [subcategoryOpen, setSubcategoryOpen] = useState(false)
  const canEdit = canManageMerchant(session.member.role)
  const queryKey = categoryQueryKeys.detail(session.merchant.id, id)
  const categoryQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await merchantApi.get<{
        product_category: MerchantCategoryDetail
      }>(session.merchant.id, `/categories/${id}`)

      return response.product_category
    },
    enabled: Boolean(id),
  })
  const deleteCategory = useMutation({
    mutationFn: () =>
      merchantApi.delete(session.merchant.id, `/categories/${id}`),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey })
      await invalidate()
      toast.success("Category deleted")
      navigate("/merchant-categories")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (categoryQuery.isPending) return <MerchantPageSkeleton />
  if (categoryQuery.isError || !categoryQuery.data) {
    throw categoryQuery.error
  }

  const category = categoryQuery.data
  const hasSubcategories = category.category_children.length > 0

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <Heading>{category.name}</Heading>
          <div className="flex items-center gap-x-2">
            <CategoryStatusBadges category={category} />
            {canEdit && (
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <IconButton
                    size="small"
                    variant="transparent"
                    aria-label="Category actions"
                    disabled={deleteCategory.isPending}
                  >
                    <EllipsisHorizontal />
                  </IconButton>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  <DropdownMenu.Item
                    className="gap-x-2"
                    onClick={() => setEditOpen(true)}
                  >
                    <PencilSquare className="text-ui-fg-subtle" />
                    Edit
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    className="gap-x-2"
                    onClick={async () => {
                      if (hasSubcategories) {
                        toast.error(
                          `${category.name} has subcategories. Move or delete them first.`
                        )
                        return
                      }

                      const confirmed = await prompt({
                        title: `Delete ${category.name}?`,
                        description:
                          "This can't be undone. Products in the category stay in your catalog.",
                        confirmText: "Delete",
                        cancelText: "Cancel",
                      })

                      if (confirmed) deleteCategory.mutate()
                    }}
                  >
                    <Trash className="text-ui-fg-subtle" />
                    Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu>
            )}
          </div>
        </div>
        <DetailRow label="Description">
          <Text size="small" leading="compact">
            {category.description || "-"}
          </Text>
        </DetailRow>
        <DetailRow label="Handle">
          <Text size="small" leading="compact">
            /{category.handle}
          </Text>
        </DetailRow>
      </Container>
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between px-6 py-4">
          <Heading level="h2">Organize</Heading>
          {canEdit && (
            <Button
              size="small"
              variant="secondary"
              onClick={() => setSubcategoryOpen(true)}
            >
              <Plus />
              Add subcategory
            </Button>
          )}
        </div>
        <DetailRow label="Path">
          <div className="flex flex-wrap items-center gap-1">
            {category.path.map((ancestor) => (
              <Fragment key={ancestor.id}>
                <Link
                  to={`/merchant-categories/${ancestor.id}`}
                  className="text-ui-fg-interactive txt-compact-small"
                >
                  {ancestor.name}
                </Link>
                <Text size="small" leading="compact" className="text-ui-fg-muted">
                  /
                </Text>
              </Fragment>
            ))}
            <Text size="small" leading="compact" weight="plus">
              {category.name}
            </Text>
          </div>
        </DetailRow>
        <DetailRow label="Subcategories">
          {hasSubcategories ? (
            <div className="flex flex-wrap gap-1">
              {category.category_children.map((child) => (
                <Badge key={child.id} size="2xsmall" asChild>
                  <Link to={`/merchant-categories/${child.id}`}>
                    {child.name}
                  </Link>
                </Badge>
              ))}
            </div>
          ) : (
            <Text size="small" leading="compact">
              -
            </Text>
          )}
        </DetailRow>
      </Container>
      <CatalogProductsSection
        session={session}
        group={{
          kind: "category",
          id: category.id,
          name: category.name,
          product_count: category.product_count,
          products: category.products,
        }}
        productsPath={`/categories/${category.id}/products`}
        queryKey={queryKey}
        canEdit={canEdit}
        onChanged={invalidate}
      />
      {canEdit && (
        <>
          <EditCategoryDrawer
            key={category.updated_at}
            session={session}
            category={category}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <CreateCategoryModal
            key={category.id}
            session={session}
            open={subcategoryOpen}
            onOpenChange={setSubcategoryOpen}
            parentCategoryId={category.id}
          />
        </>
      )}
    </div>
  )
}

const MerchantCategoryDetailsPage = () => (
  <MerchantRoute>
    {(session) => <CategoryDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = { breadcrumb: () => "Category details" }

export default MerchantCategoryDetailsPage
