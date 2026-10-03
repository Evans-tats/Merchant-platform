import { StatusBadge } from "@medusajs/ui"

// Medusa shows a category's status and visibility side by side.
export const CategoryStatusBadges = ({
  category,
}: {
  category: { is_active: boolean; is_internal: boolean }
}) => (
  <div className="flex flex-wrap gap-1">
    <StatusBadge color={category.is_active ? "green" : "grey"}>
      {category.is_active ? "Active" : "Inactive"}
    </StatusBadge>
    <StatusBadge color={category.is_internal ? "blue" : "green"}>
      {category.is_internal ? "Internal" : "Public"}
    </StatusBadge>
  </div>
)
