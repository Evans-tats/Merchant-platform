import { Button, FocusModal, Heading, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type FormEvent, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"

import { adjustedHandleNotice } from "../../../lib/handles"
import {
  errorMessage,
  merchantApi,
  type MerchantCategory,
  type MerchantCategoryListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import {
  categoryCreatePayload,
  emptyCategoryForm,
  hasCategoryFormErrors,
  parentCategoryOptions,
  validateCategoryForm,
  type CategoryFormErrors,
  type CategoryFormValues,
  type CategoryPayload,
} from "./category-form"
import { CategoryFormFields } from "./category-form-fields"
import {
  categoryQueryKeys,
  useInvalidateCategories,
} from "./category-queries"

export const CreateCategoryModal = ({
  session,
  open,
  onOpenChange,
  parentCategoryId,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
  // Preselects a parent, for "Add subcategory" on a category page.
  parentCategoryId?: string
}) => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCategories(session.merchant.id)
  const initialValues = {
    ...emptyCategoryForm,
    parent_category_id: parentCategoryId ?? "",
  }
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
    () => parentCategoryOptions(categoriesQuery.data?.product_categories ?? []),
    [categoriesQuery.data]
  )
  const reset = () => {
    setValues(initialValues)
    setErrors({})
  }
  const createCategory = useMutation({
    mutationFn: (payload: CategoryPayload) =>
      merchantApi.post<{ product_categories: MerchantCategory[] }>(
        session.merchant.id,
        "/categories",
        { product_categories: [payload] }
      ),
    onSuccess: async ({ product_categories: [category] }, payload) => {
      await invalidate()
      toast.success(`Created category ${category.name}`, {
        description: adjustedHandleNotice(payload.handle, category.handle),
      })
      reset()
      onOpenChange(false)
      navigate(`/merchant-categories/${category.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateCategoryForm(values)

    setErrors(nextErrors)

    if (!hasCategoryFormErrors(nextErrors)) {
      createCategory.mutate(categoryCreatePayload(values))
    }
  }

  return (
    <FocusModal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <FocusModal.Content>
        <form
          className="flex h-full flex-col overflow-hidden"
          noValidate
          onSubmit={submit}
        >
          <FocusModal.Header />
          <FocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto px-6 py-16">
            <div className="flex w-full max-w-[720px] flex-col gap-y-8">
              <div className="flex flex-col gap-y-1">
                <Heading>Create category</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Create a new category to organize your products.
                </Text>
              </div>
              <CategoryFormFields
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
            </div>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button
                  size="small"
                  variant="secondary"
                  type="button"
                  disabled={createCategory.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                type="submit"
                isLoading={createCategory.isPending}
              >
                Create
              </Button>
            </div>
          </FocusModal.Footer>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}
