import { HANDLE_PATTERN, handleError, handleFromTitle } from "../../../lib/handles"

export type CategoryFormValues = {
  name: string
  handle: string
  description: string
  status: "active" | "inactive"
  visibility: "public" | "internal"
  // Empty for a top-level category.
  parent_category_id: string
}

export type CategoryFormErrors = Partial<
  Record<keyof CategoryFormValues, string>
>

export type CategoryPayload = {
  name: string
  handle?: string
  description?: string
  is_active: boolean
  is_internal: boolean
  parent_category_id?: string | null
}

type CategoryNode = {
  id: string
  name: string
  parent_category_id: string | null
}

// Medusa's create form starts a category as active and public.
export const emptyCategoryForm: CategoryFormValues = {
  name: "",
  handle: "",
  description: "",
  status: "active",
  visibility: "public",
  parent_category_id: "",
}

export function categoryFormFrom(category: {
  name: string
  handle: string
  description: string
  is_active: boolean
  is_internal: boolean
  parent_category_id: string | null
}): CategoryFormValues {
  return {
    name: category.name,
    handle: category.handle,
    description: category.description,
    status: category.is_active ? "active" : "inactive",
    visibility: category.is_internal ? "internal" : "public",
    parent_category_id: category.parent_category_id ?? "",
  }
}

export function validateCategoryForm(
  values: CategoryFormValues
): CategoryFormErrors {
  const errors: CategoryFormErrors = {}
  const handle = values.handle.trim()

  if (!values.name.trim()) {
    errors.name = "Enter a title"
  }

  if (handle && !HANDLE_PATTERN.test(handle)) {
    errors.handle = handleError("summer-dresses")
  }

  return errors
}

export function hasCategoryFormErrors(errors: CategoryFormErrors) {
  return Object.values(errors).some(Boolean)
}

function sharedPayload(values: CategoryFormValues) {
  return {
    name: values.name.trim(),
    is_active: values.status === "active",
    is_internal: values.visibility === "internal",
  }
}

// Blank handle and description are left out; the handle then comes from the
// name.
export function categoryCreatePayload(
  values: CategoryFormValues
): CategoryPayload {
  const handle = values.handle.trim()
  const description = values.description.trim()

  return {
    ...sharedPayload(values),
    ...(handle && { handle }),
    ...(description && { description }),
    ...(values.parent_category_id && {
      parent_category_id: values.parent_category_id,
    }),
  }
}

// Editing can clear the description and move the category to the top level.
// Clearing the handle rebuilds it from the name.
export function categoryUpdatePayload(
  values: CategoryFormValues
): CategoryPayload {
  const handle = values.handle.trim() || handleFromTitle(values.name)

  return {
    ...sharedPayload(values),
    ...(handle && { handle }),
    description: values.description.trim(),
    parent_category_id: values.parent_category_id || null,
  }
}

function ancestorsOf(
  category: CategoryNode,
  byId: Map<string, CategoryNode>
): CategoryNode[] {
  const ancestors: CategoryNode[] = []
  const seen = new Set([category.id])
  let parentId = category.parent_category_id

  while (parentId && byId.has(parentId) && !seen.has(parentId)) {
    const parent = byId.get(parentId)!

    seen.add(parentId)
    ancestors.unshift(parent)
    parentId = parent.parent_category_id
  }

  return ancestors
}

/**
 * Category choices for product forms, in tree order and named by their full
 * path ("Women / Dresses"), like Medusa's nested category picker.
 */
export function categoryChoices(
  categories: CategoryNode[]
): Array<{ id: string; name: string }> {
  return parentCategoryOptions(categories).map(({ id, label }) => ({
    id,
    name: label,
  }))
}

/**
 * Categories a category can sit under, labelled with their full path. When
 * editing, the category itself and its subcategories are left out, since a
 * category can't move inside itself.
 */
export function parentCategoryOptions(
  categories: CategoryNode[],
  editingId?: string
): Array<{ id: string; label: string }> {
  const byId = new Map(categories.map((category) => [category.id, category]))

  return categories
    .filter((category) => {
      if (!editingId) {
        return true
      }

      return (
        category.id !== editingId &&
        !ancestorsOf(category, byId).some(({ id }) => id === editingId)
      )
    })
    .map((category) => ({
      id: category.id,
      label: [...ancestorsOf(category, byId), category]
        .map(({ name }) => name)
        .join(" / "),
    }))
}
