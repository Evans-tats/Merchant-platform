import {
  Button,
  Checkbox,
  Container,
  Drawer,
  Heading,
  Label,
  StatusBadge,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, type ReactNode } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"

import {
  MerchantPageSkeleton,
  MerchantRoute,
} from "../../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantCampaignDetail,
  type MerchantPromotionListResponse,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import {
  CAMPAIGN_STATUS_BADGES,
  PROMOTION_STATUS_BADGES,
  budgetPercent,
  campaignFormFrom,
  campaignFormProblem,
  campaignUpdatePayload,
  describeBudget,
  describeCampaignDates,
  describeDiscount,
  type CampaignFormState,
} from "../../../../lib/merchant-promotions"
import { BudgetBar, CampaignFields } from "../../promotions/promotion-form"

const SectionRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-2 items-start gap-4 px-6 py-4">
    <Text size="small" leading="compact" weight="plus" className="text-ui-fg-subtle">
      {label}
    </Text>
    <Text size="small" leading="compact" className="break-words">
      {children}
    </Text>
  </div>
)

const EditCampaignDrawer = ({
  session,
  campaign,
  open,
  onOpenChange,
  onSaved,
}: {
  session: MerchantSession
  campaign: MerchantCampaignDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) => {
  const [form, setForm] = useState<CampaignFormState>(() => campaignFormFrom(campaign))
  const problem = campaignFormProblem(form)
  const save = useMutation({
    mutationFn: () =>
      merchantApi.post(
        session.merchant.id,
        `/campaigns/${campaign.id}`,
        campaignUpdatePayload(form, campaign)
      ),
    onSuccess: async () => {
      await onSaved()
      toast.success("Campaign saved")
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) setForm(campaignFormFrom(campaign))
      }}
    >
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Edit {campaign.name}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto">
          <CampaignFields
            idPrefix="edit-campaign"
            campaign={form}
            currencyCode={campaign.budget?.currency_code ?? "kes"}
            budgetLocked
            onChange={(change) => setForm((current) => ({ ...current, ...change }))}
          />
        </Drawer.Body>
        <Drawer.Footer>
          <div className="flex w-full items-center justify-between gap-x-4">
            <Text size="small" className="text-ui-fg-subtle">
              {problem ?? ""}
            </Text>
            <div className="flex gap-x-2">
              <Drawer.Close asChild>
                <Button size="small" variant="secondary" type="button">
                  Cancel
                </Button>
              </Drawer.Close>
              <Button
                size="small"
                type="button"
                disabled={Boolean(problem)}
                isLoading={save.isPending}
                onClick={() => save.mutate()}
              >
                Save
              </Button>
            </div>
          </div>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

// The merchant's promotions that aren't in a campaign yet. A spend budget
// only takes promotions in its currency.
const AddPromotionsDrawer = ({
  session,
  campaign,
  open,
  onOpenChange,
  onSaved,
}: {
  session: MerchantSession
  campaign: MerchantCampaignDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) => {
  const [selected, setSelected] = useState<string[]>([])
  const promotionsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "promotions"),
      "campaign-candidates",
    ],
    queryFn: () =>
      merchantApi.get<MerchantPromotionListResponse>(
        session.merchant.id,
        "/promotions?limit=100&offset=0"
      ),
    enabled: open,
  })
  const candidates = (promotionsQuery.data?.promotions ?? []).filter(
    (promotion) =>
      !promotion.campaign &&
      (campaign.budget?.type !== "spend" ||
        promotion.application_method.currency_code === campaign.budget.currency_code)
  )
  const add = useMutation({
    mutationFn: () =>
      merchantApi.post(session.merchant.id, `/campaigns/${campaign.id}/promotions`, {
        add: selected,
      }),
    onSuccess: async () => {
      await onSaved()
      toast.success("Promotions added")
      setSelected([])
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Add promotions to {campaign.name}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="overflow-y-auto">
          {promotionsQuery.isPending ? (
            <Text size="small" className="text-ui-fg-muted">
              Loading…
            </Text>
          ) : candidates.length ? (
            <ul className="flex flex-col divide-y divide-ui-border-base rounded-lg border border-ui-border-base">
              {candidates.map((promotion) => {
                const checkboxId = `campaign-add-${promotion.id}`

                return (
                  <li key={promotion.id} className="flex items-center gap-x-3 px-3 py-2">
                    <Checkbox
                      id={checkboxId}
                      checked={selected.includes(promotion.id)}
                      onCheckedChange={(checked) =>
                        setSelected((current) =>
                          checked === true
                            ? [...current, promotion.id]
                            : current.filter((value) => value !== promotion.id)
                        )
                      }
                    />
                    <Label htmlFor={checkboxId} className="flex min-w-0 flex-col">
                      <Text size="small" weight="plus" leading="compact">
                        {promotion.code}
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {describeDiscount(promotion)}
                      </Text>
                    </Label>
                  </li>
                )
              })}
            </ul>
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              Every promotion is already in a campaign. Create a promotion first.
            </Text>
          )}
        </Drawer.Body>
        <Drawer.Footer>
          <Drawer.Close asChild>
            <Button size="small" variant="secondary" type="button">
              Cancel
            </Button>
          </Drawer.Close>
          <Button
            size="small"
            type="button"
            disabled={!selected.length}
            isLoading={add.isPending}
            onClick={() => add.mutate()}
          >
            Add {selected.length || ""}
          </Button>
        </Drawer.Footer>
      </Drawer.Content>
    </Drawer>
  )
}

const CampaignDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const canEdit = canManageMerchant(session.member.role)
  const detailKey = merchantQueryKeys.resource(session.merchant.id, `campaigns/${id}`)
  const campaignQuery = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const response = await merchantApi.get<{ campaign: MerchantCampaignDetail }>(
        session.merchant.id,
        `/campaigns/${id}`
      )

      return response.campaign
    },
    enabled: Boolean(id),
  })
  const refresh = async () => {
    await Promise.all(
      [`campaigns/${id}`, "campaigns", "promotions"].map((resource) =>
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(session.merchant.id, resource),
        })
      )
    )
  }
  const removePromotion = useMutation({
    mutationFn: (promotionId: string) =>
      merchantApi.post(session.merchant.id, `/campaigns/${id}/promotions`, {
        remove: [promotionId],
      }),
    onSuccess: async () => {
      await refresh()
      toast.success("Promotion removed from the campaign")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const deleteCampaign = useMutation({
    mutationFn: () => merchantApi.delete(session.merchant.id, `/campaigns/${id}`),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: detailKey })
      await Promise.all(
        ["campaigns", "promotions"].map((resource) =>
          queryClient.invalidateQueries({
            queryKey: merchantQueryKeys.resource(session.merchant.id, resource),
          })
        )
      )
      toast.success("Campaign deleted")
      navigate("/merchant-campaigns")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (campaignQuery.isPending) return <MerchantPageSkeleton />
  if (campaignQuery.isError || !campaignQuery.data) throw campaignQuery.error

  const campaign = campaignQuery.data
  const badge = CAMPAIGN_STATUS_BADGES[campaign.status]

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <div className="flex items-center gap-x-2">
              <Heading>{campaign.name}</Heading>
              <StatusBadge color={badge.color}>{badge.label}</StatusBadge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {campaign.description || describeCampaignDates(campaign)}
            </Text>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="small" variant="secondary" asChild>
              <Link to="/merchant-campaigns">Back</Link>
            </Button>
            {canEdit && (
              <>
                <Button size="small" variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  isLoading={deleteCampaign.isPending}
                  onClick={async () => {
                    const confirmed = await prompt({
                      title: `Delete ${campaign.name}?`,
                      description:
                        "Its promotions stay, without the campaign's dates and budget.",
                      confirmText: "Delete",
                      cancelText: "Cancel",
                    })

                    if (confirmed) deleteCampaign.mutate()
                  }}
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Details</Heading>
        </div>
        <SectionRow label="Dates">{describeCampaignDates(campaign)}</SectionRow>
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Text size="small" leading="compact" weight="plus" className="text-ui-fg-subtle">
              Budget
            </Text>
            <Text size="small" leading="compact">
              {describeBudget(campaign.budget)}
            </Text>
          </div>
          <BudgetBar percent={budgetPercent(campaign.budget)} />
        </div>
      </Container>

      <Container className="divide-y p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <div className="flex flex-col">
            <Heading level="h2">Promotions</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              They follow this campaign's dates and budget.
            </Text>
          </div>
          {canEdit && (
            <Button size="small" variant="secondary" onClick={() => setAddOpen(true)}>
              Add promotions
            </Button>
          )}
        </div>
        {campaign.promotions.length ? (
          campaign.promotions.map((promotion) => {
            const promotionBadge = PROMOTION_STATUS_BADGES[promotion.status]

            return (
              <div
                key={promotion.id}
                className="flex flex-wrap items-center justify-between gap-3 px-6 py-3"
              >
                <div className="flex min-w-0 flex-col">
                  <Link
                    className="font-medium text-ui-fg-interactive"
                    to={`/merchant-promotions/${promotion.id}`}
                  >
                    {promotion.code}
                  </Link>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {describeDiscount(promotion)}
                  </Text>
                </div>
                <div className="flex items-center gap-x-3">
                  <StatusBadge color={promotionBadge.color}>
                    {promotionBadge.label}
                  </StatusBadge>
                  {canEdit && (
                    <Button
                      size="small"
                      variant="transparent"
                      disabled={removePromotion.isPending}
                      onClick={() => removePromotion.mutate(promotion.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              No promotions yet.
            </Text>
          </div>
        )}
      </Container>

      {canEdit && (
        <>
          <EditCampaignDrawer
            session={session}
            campaign={campaign}
            open={editOpen}
            onOpenChange={setEditOpen}
            onSaved={refresh}
          />
          <AddPromotionsDrawer
            session={session}
            campaign={campaign}
            open={addOpen}
            onOpenChange={setAddOpen}
            onSaved={refresh}
          />
        </>
      )}
    </div>
  )
}

const MerchantCampaignDetailsPage = () => (
  <MerchantRoute>
    {(session) => <CampaignDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = { breadcrumb: () => "Campaign details" }

export default MerchantCampaignDetailsPage
