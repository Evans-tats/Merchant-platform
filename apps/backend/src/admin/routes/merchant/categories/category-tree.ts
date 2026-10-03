type TreeCategory = {
  id: string
  name: string
  handle: string
  depth: number
  parent_category_id: string | null
}

export type NestedCategory = {
  id: string
  name: string
  category_children: NestedCategory[]
}

/**
 * Nests tree-ordered categories under their parents, as the Organize view's
 * drag-and-drop tree expects.
 */
export function nestCategories(
  categories: Array<{ id: string; name: string; parent_category_id: string | null }>
): NestedCategory[] {
  const nodes = new Map<string, NestedCategory>(
    categories.map(({ id, name }) => [id, { id, name, category_children: [] }])
  )
  const roots: NestedCategory[] = []

  for (const category of categories) {
    const node = nodes.get(category.id)!
    const parent = category.parent_category_id
      ? nodes.get(category.parent_category_id)
      : undefined

    if (parent) {
      parent.category_children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

/**
 * The rows the category list shows. Categories arrive in tree order (each
 * parent followed by its subcategories); collapsed parents hide everything
 * beneath them. A search shows every match at the top level instead.
 */
export function visibleCategoryRows<T extends TreeCategory>(
  categories: T[],
  collapsed: ReadonlySet<string>,
  search: string
): Array<T & { indent: number; childCount: number }> {
  const term = search.trim().toLowerCase()

  if (term) {
    return categories
      .filter(({ name, handle }) =>
        `${name} ${handle}`.toLowerCase().includes(term)
      )
      .map((category) => ({ ...category, indent: 0, childCount: 0 }))
  }

  const childCounts = new Map<string, number>()

  for (const { parent_category_id: parentId } of categories) {
    if (parentId) {
      childCounts.set(parentId, (childCounts.get(parentId) ?? 0) + 1)
    }
  }

  const rows: Array<T & { indent: number; childCount: number }> = []
  // Depth of the collapsed parent whose subcategories are being skipped.
  let hiddenBelowDepth: number | null = null

  for (const category of categories) {
    if (hiddenBelowDepth !== null && category.depth > hiddenBelowDepth) {
      continue
    }

    hiddenBelowDepth = collapsed.has(category.id) ? category.depth : null
    rows.push({
      ...category,
      indent: category.depth,
      childCount: childCounts.get(category.id) ?? 0,
    })
  }

  return rows
}
