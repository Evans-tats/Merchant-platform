import { HANDLE_PATTERN, handleError, handleFromTitle } from "../../../lib/handles"

export type CollectionFormValues = {
  title: string
  handle: string
}

export type CollectionFormErrors = Partial<
  Record<keyof CollectionFormValues, string>
>

export type CollectionPayload = {
  title: string
  handle?: string
}

export const emptyCollectionForm: CollectionFormValues = {
  title: "",
  handle: "",
}

export function validateCollectionForm(
  values: CollectionFormValues
): CollectionFormErrors {
  const errors: CollectionFormErrors = {}
  const handle = values.handle.trim()

  if (!values.title.trim()) {
    errors.title = "Enter a title"
  }

  if (handle && !HANDLE_PATTERN.test(handle)) {
    errors.handle = handleError("summer-sale")
  }

  return errors
}

export function hasCollectionFormErrors(errors: CollectionFormErrors) {
  return Object.values(errors).some(Boolean)
}

// A blank handle is left out so the backend builds one from the title.
export function collectionCreatePayload(
  values: CollectionFormValues
): CollectionPayload {
  const handle = values.handle.trim()

  return {
    title: values.title.trim(),
    ...(handle && { handle }),
  }
}

// Clearing the handle while editing rebuilds it from the title.
export function collectionUpdatePayload(
  values: CollectionFormValues
): CollectionPayload {
  const handle = values.handle.trim() || handleFromTitle(values.title)

  return {
    title: values.title.trim(),
    ...(handle && { handle }),
  }
}
