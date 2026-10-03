type TreeNode = {
  id: string
  name: string
  rank: number
  parent_category_id: string | null
}

/**
 * Orders categories the way a tree reads: each parent followed by its
 * children by rank, with each category's depth. A category whose parent isn't
 * in the list is shown at the top level.
 */
export function orderCategoryTree<T extends TreeNode>(
  categories: T[]
): Array<T & { depth: number }> {
  const ids = new Set(categories.map(({ id }) => id))
  const childrenOf = new Map<string | null, T[]>()

  for (const category of categories) {
    const parentId =
      category.parent_category_id && ids.has(category.parent_category_id)
        ? category.parent_category_id
        : null
    const siblings = childrenOf.get(parentId) ?? []

    siblings.push(category)
    childrenOf.set(parentId, siblings)
  }

  const ordered: Array<T & { depth: number }> = []
  const visited = new Set<string>()
  const visit = (parentId: string | null, depth: number) => {
    const siblings = [...(childrenOf.get(parentId) ?? [])].sort(
      (a, b) => a.rank - b.rank || a.name.localeCompare(b.name)
    )

    for (const category of siblings) {
      if (visited.has(category.id)) {
        continue
      }

      visited.add(category.id)
      ordered.push({ ...category, depth })
      visit(category.id, depth + 1)
    }
  }

  visit(null, 0)

  return ordered
}

/**
 * Converts a position among the merchant's own sibling categories into the
 * rank Medusa stores. Medusa ranks every category with the same parent
 * together, and all stores' top-level categories share one parent (none), so
 * a store's position can't be saved as the rank directly.
 *
 * Medusa moves a category to the given rank and shifts the categories
 * between its old and new rank by one, so moving up takes the rank of the
 * sibling it goes before, and moving down the rank of the sibling it goes
 * after.
 */
export function rankForPosition(input: {
  category: { id: string; rank: number; parent_category_id: string | null }
  parent_category_id: string | null
  // Zero-based position among the merchant's categories under that parent.
  position: number
  // The merchant's categories under that parent; may include the category.
  siblings: Array<{ id: string; rank: number }>
  // How many categories, from every store, are under that parent.
  all_sibling_count: number
}): number {
  const others = input.siblings
    .filter(({ id }) => id !== input.category.id)
    .sort((a, b) => a.rank - b.rank)
  const position = Math.min(Math.max(input.position, 0), others.length)
  const before = others[position]
  const after = others[position - 1]
  const sameParent =
    (input.category.parent_category_id ?? null) === input.parent_category_id

  if (!sameParent) {
    // Medusa caps a rank past the end at the last place.
    return before ? before.rank : input.all_sibling_count
  }

  if (before && before.rank < input.category.rank) {
    return before.rank
  }

  if (after && after.rank > input.category.rank) {
    return after.rank
  }

  return input.category.rank
}

/**
 * Whether moving a category under a parent would put it inside itself.
 * Medusa stores each category's ancestors in mpath ("root.child.grandchild").
 */
export function isOwnDescendant(
  categoryId: string,
  parent: { id: string; mpath: string }
): boolean {
  return parent.id === categoryId || parent.mpath.split(".").includes(categoryId)
}
