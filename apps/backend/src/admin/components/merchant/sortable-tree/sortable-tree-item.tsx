// Ported from Medusa's admin dashboard (@medusajs/dashboard 2.19.0,
// src/components/common/sortable-tree), MIT licensed.

import type { UniqueIdentifier } from "@dnd-kit/core"
import { AnimateLayoutChanges, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { CSSProperties } from "react"

import { TreeItem, TreeItemProps } from "./tree-item"
import { iOS } from "./utils"

interface SortableTreeItemProps extends TreeItemProps {
  id: UniqueIdentifier
}

const animateLayoutChanges: AnimateLayoutChanges = ({
  isSorting,
  wasDragging,
}) => {
  return isSorting || wasDragging ? false : true
}

export function SortableTreeItem({
  id,
  depth,
  disabled,
  ...props
}: SortableTreeItemProps) {
  const {
    attributes,
    isDragging,
    isSorting,
    listeners,
    setDraggableNodeRef,
    setDroppableNodeRef,
    transform,
    transition,
  } = useSortable({
    id,
    animateLayoutChanges,
    disabled,
  })
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  }

  return (
    <TreeItem
      ref={setDraggableNodeRef}
      wrapperRef={setDroppableNodeRef}
      style={style}
      depth={depth}
      ghost={isDragging}
      disableSelection={iOS}
      disableInteraction={isSorting}
      disabled={disabled}
      handleProps={{
        listeners,
        attributes,
      }}
      {...props}
    />
  )
}
