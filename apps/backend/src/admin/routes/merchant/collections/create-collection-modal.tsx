import { Button, FocusModal, Heading, Text, toast } from "@medusajs/ui"
import { useMutation } from "@tanstack/react-query"
import { type FormEvent, useState } from "react"
import { useNavigate } from "react-router-dom"

import {
  errorMessage,
  merchantApi,
  type MerchantCollection,
  type MerchantSession,
} from "../../../lib/merchant-api"
import { adjustedHandleNotice } from "../../../lib/handles"
import {
  collectionCreatePayload,
  emptyCollectionForm,
  hasCollectionFormErrors,
  validateCollectionForm,
  type CollectionFormErrors,
  type CollectionFormValues,
  type CollectionPayload,
} from "./collection-form"
import { CollectionFormFields } from "./collection-form-fields"
import { useInvalidateCollections } from "./collection-queries"

export const CreateCollectionModal = ({
  session,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const navigate = useNavigate()
  const invalidate = useInvalidateCollections(session.merchant.id)
  const [values, setValues] =
    useState<CollectionFormValues>(emptyCollectionForm)
  const [errors, setErrors] = useState<CollectionFormErrors>({})
  const reset = () => {
    setValues(emptyCollectionForm)
    setErrors({})
  }
  const createCollection = useMutation({
    mutationFn: (payload: CollectionPayload) =>
      merchantApi.post<{ collections: MerchantCollection[] }>(
        session.merchant.id,
        "/collections",
        { collections: [payload] }
      ),
    onSuccess: async ({ collections: [collection] }, payload) => {
      await invalidate()
      toast.success("Collection created", {
        description: adjustedHandleNotice(payload.handle, collection.handle),
      })
      reset()
      onOpenChange(false)
      navigate(`/merchant-collections/${collection.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateCollectionForm(values)

    setErrors(nextErrors)

    if (!hasCollectionFormErrors(nextErrors)) {
      createCollection.mutate(collectionCreatePayload(values))
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
                <Heading>Create collection</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Group products for your storefront, like a seasonal edit or
                  a best-sellers list.
                </Text>
              </div>
              <CollectionFormFields
                values={values}
                errors={errors}
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
                  disabled={createCollection.isPending}
                >
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                type="submit"
                isLoading={createCollection.isPending}
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
