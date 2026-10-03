import { EllipsisHorizontal, PencilSquare, Trash } from "@medusajs/icons"
import {
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
import { type FormEvent, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

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
  type MerchantCollectionDetail,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import {
  collectionUpdatePayload,
  hasCollectionFormErrors,
  validateCollectionForm,
  type CollectionFormErrors,
  type CollectionFormValues,
  type CollectionPayload,
} from "../collection-form"
import { CollectionFormFields } from "../collection-form-fields"
import {
  collectionQueryKeys,
  useInvalidateCollections,
} from "../collection-queries"

const EditCollectionDrawer = ({
  session,
  collection,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  collection: MerchantCollectionDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const invalidate = useInvalidateCollections(session.merchant.id)
  const initialValues = {
    title: collection.title,
    handle: collection.handle,
  }
  const [values, setValues] = useState<CollectionFormValues>(initialValues)
  const [errors, setErrors] = useState<CollectionFormErrors>({})
  const updateCollection = useMutation({
    mutationFn: (payload: CollectionPayload) =>
      merchantApi.post<{ collection: MerchantCollectionDetail }>(
        session.merchant.id,
        `/collections/${collection.id}`,
        payload
      ),
    onSuccess: async ({ collection: saved }, payload) => {
      await invalidate(collection.id)
      toast.success("Collection updated", {
        description: adjustedHandleNotice(payload.handle, saved.handle),
      })
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors = validateCollectionForm(values)

    setErrors(nextErrors)

    if (!hasCollectionFormErrors(nextErrors)) {
      updateCollection.mutate(collectionUpdatePayload(values))
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
            <Drawer.Title>Edit collection</Drawer.Title>
          </Drawer.Header>
          <Drawer.Body className="flex-1">
            <CollectionFormFields
              layout="stack"
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
          </Drawer.Body>
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button
                size="small"
                variant="secondary"
                type="button"
                disabled={updateCollection.isPending}
              >
                Cancel
              </Button>
            </Drawer.Close>
            <Button
              size="small"
              type="submit"
              isLoading={updateCollection.isPending}
            >
              Save
            </Button>
          </Drawer.Footer>
        </form>
      </Drawer.Content>
    </Drawer>
  )
}

const CollectionDetailsContent = ({
  session,
}: {
  session: MerchantSession
}) => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateCollections(session.merchant.id)
  const [editOpen, setEditOpen] = useState(false)
  const canEdit = canManageMerchant(session.member.role)
  const queryKey = collectionQueryKeys.detail(session.merchant.id, id)
  const collectionQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await merchantApi.get<{
        collection: MerchantCollectionDetail
      }>(session.merchant.id, `/collections/${id}`)

      return response.collection
    },
    enabled: Boolean(id),
  })
  const deleteCollection = useMutation({
    mutationFn: () =>
      merchantApi.delete(session.merchant.id, `/collections/${id}`),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey })
      await invalidate()
      toast.success("Collection deleted")
      navigate("/merchant-collections")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (collectionQuery.isPending) return <MerchantPageSkeleton />
  if (collectionQuery.isError || !collectionQuery.data) {
    throw collectionQuery.error
  }

  const collection = collectionQuery.data

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <Heading>{collection.title}</Heading>
          {canEdit && (
            <DropdownMenu>
              <DropdownMenu.Trigger asChild>
                <IconButton
                  size="small"
                  variant="transparent"
                  aria-label="Collection actions"
                  disabled={deleteCollection.isPending}
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
                    const confirmed = await prompt({
                      title: `Delete ${collection.title}?`,
                      description:
                        "This can't be undone. Products in the collection stay in your catalog.",
                      confirmText: "Delete",
                      cancelText: "Cancel",
                    })

                    if (confirmed) deleteCollection.mutate()
                  }}
                >
                  <Trash className="text-ui-fg-subtle" />
                  Delete
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu>
          )}
        </div>
        <div className="text-ui-fg-subtle grid grid-cols-2 items-center px-6 py-4">
          <Text size="small" leading="compact" weight="plus">
            Handle
          </Text>
          <Text size="small" leading="compact">
            /{collection.handle}
          </Text>
        </div>
      </Container>
      <CatalogProductsSection
        session={session}
        group={{
          kind: "collection",
          id: collection.id,
          name: collection.title,
          product_count: collection.product_count,
          products: collection.products,
        }}
        productsPath={`/collections/${collection.id}/products`}
        queryKey={queryKey}
        canEdit={canEdit}
        onChanged={() => invalidate(collection.id)}
      />
      {canEdit && (
        <EditCollectionDrawer
          key={collection.updated_at}
          session={session}
          collection={collection}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </div>
  )
}

const MerchantCollectionDetailsPage = () => (
  <MerchantRoute>
    {(session) => <CollectionDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = { breadcrumb: () => "Collection details" }

export default MerchantCollectionDetailsPage
