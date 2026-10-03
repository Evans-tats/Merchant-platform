// Ported from Medusa's admin dashboard (@medusajs/dashboard 2.19.0,
// src/components/common/sortable-tree), MIT licensed.

import type { DraggableAttributes, UniqueIdentifier } from "@dnd-kit/core"
import { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities"
import type { MutableRefObject } from "react"

export interface TreeItem extends Record<string, unknown> {
  id: UniqueIdentifier
}

export interface FlattenedItem extends TreeItem {
  parentId: UniqueIdentifier | null
  depth: number
  index: number
}

export type SensorContext = MutableRefObject<{
  items: FlattenedItem[]
  offset: number
}>

export type HandleProps = {
  attributes?: DraggableAttributes | undefined
  listeners?: SyntheticListenerMap | undefined
}
