import {
  Button,
  Container,
  Drawer,
  Heading,
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
  type MerchantPromotionDetail,
  type MerchantPromotionStatus,
  type MerchantSession,
} from "../../../../lib/merchant-api"
import {
  PROMOTION_STATUS_BADGES,
  budgetPercent,
  describeBudget,
  describeCampaignDates,
  describeDiscount,
  describeItems,
  describeUses,
  describeWho,
  promotionFormFrom,
  promotionFormProblem,
  promotionUpdatePayload,
  templateLabel,
  templateOf,
  type PromotionFormState,
} from "../../../../lib/merchant-promotions"
import {
  BudgetBar,
  CampaignChoiceFields,
  PromotionDetailsFields,
} from "../promotion-form"

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

const EditPromotionDrawer = ({
  session,
  promotion,
  open,
  onOpenChange,
  onSaved,
}: {
  session: MerchantSession
  promotion: MerchantPromotionDetail
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) => {
  const [form, setForm] = useState<PromotionFormState>(() =>
    promotionFormFrom(promotion)
  )
  const knownLabels = new Map(
    [...promotion.rules, ...promotion.target_rules, ...promotion.buy_rules].flatMap(
      ({ values }) => values.map(({ value, label }) => [value, label] as const)
    )
  )
  const problem = promotionFormProblem(form)
  const save = useMutation({
    mutationFn: () =>
      merchantApi.post(
        session.merchant.id,
        `/promotions/${promotion.id}`,
        promotionUpdatePayload(form)
      ),
    onSuccess: async () => {
      await onSaved()
      toast.success("Promotion saved")
      onOpenChange(false)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) setForm(promotionFormFrom(promotion))
      }}
    >
      <Drawer.Content>
        <Drawer.Header>
          <Drawer.Title>Edit {promotion.code}</Drawer.Title>
        </Drawer.Header>
        <Drawer.Body className="flex flex-col gap-y-8 overflow-y-auto">
          <PromotionDetailsFields
            merchantId={session.merchant.id}
            form={form}
            currencies={promotion.currency_codes}
            mode="edit"
            knownLabels={knownLabels}
            onChange={(change) => setForm((current) => ({ ...current, ...change }))}
          />
          <div className="flex flex-col gap-y-3">
            <Text size="small" weight="plus">
              Campaign
            </Text>
            <CampaignChoiceFields
              merchantId={session.merchant.id}
              form={form}
              allowNew={false}
              onChange={(change) => setForm((current) => ({ ...current, ...change }))}
            />
          </div>
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

const PromotionDetailsContent = ({ session }: { session: MerchantSession }) => {
  const { id = "" } = useParams()
  const navigate = useNavigate()
  const prompt = usePrompt()
  const queryClient = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const canEdit = canManageMerchant(session.member.role)
  const detailKey = merchantQueryKeys.resource(session.merchant.id, `promotions/${id}`)
  const promotionQuery = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const response = await merchantApi.get<{ promotion: MerchantPromotionDetail }>(
        session.merchant.id,
        `/promotions/${id}`
      )

      return response.promotion
    },
    enabled: Boolean(id),
  })
  const refresh = async () => {
    await Promise.all(
      [`promotions/${id}`, "promotions", "campaigns"].map((resource) =>
        queryClient.invalidateQueries({
          queryKey: merchantQueryKeys.resource(session.merchant.id, resource),
        })
      )
    )
  }
  const setStatus = useMutation({
    mutationFn: (status: MerchantPromotionStatus) =>
      merchantApi.post(session.merchant.id, `/promotions/${id}`, { status }),
    onSuccess: async (_result, status) => {
      await refresh()
      toast.success(status === "active" ? "Promotion is active" : "Promotion deactivated")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const deletePromotion = useMutation({
    mutationFn: () => merchantApi.delete(session.merchant.id, `/promotions/${id}`),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: detailKey })
      await Promise.all(
        ["promotions", "campaigns"].map((resource) =>
          queryClient.invalidateQueries({
            queryKey: merchantQueryKeys.resource(session.merchant.id, resource),
          })
        )
      )
      toast.success("Promotion deleted")
      navigate("/merchant-promotions")
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  if (promotionQuery.isPending) return <MerchantPageSkeleton />
  if (promotionQuery.isError || !promotionQuery.data) throw promotionQuery.error

  const promotion = promotionQuery.data
  const badge = PROMOTION_STATUS_BADGES[promotion.status]
  const method = promotion.application_method
  const buyGet = promotion.type === "buyget"
  const campaign = promotion.campaign

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div className="flex min-w-0 flex-col gap-y-1">
            <div className="flex items-center gap-x-2">
              <Heading>{promotion.code}</Heading>
              <StatusBadge color={badge.color}>{badge.label}</StatusBadge>
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {templateLabel(templateOf(promotion))} ·{" "}
              {promotion.is_automatic
                ? "Applies automatically"
                : "Shoppers enter the code"}
            </Text>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button size="small" variant="secondary" asChild>
              <Link to="/merchant-promotions">Back</Link>
            </Button>
            {canEdit && (
              <>
                <Button size="small" variant="secondary" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button
                  size="small"
                  variant="secondary"
                  isLoading={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate(promotion.status === "active" ? "inactive" : "active")
                  }
                >
                  {promotion.status === "active" ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  size="small"
                  variant="danger"
                  isLoading={deletePromotion.isPending}
                  onClick={async () => {
                    const confirmed = await prompt({
                      title: `Delete ${promotion.code}?`,
                      description:
                        "Shoppers can't use it anymore. Orders that already used it keep their discount.",
                      confirmText: "Delete",
                      cancelText: "Cancel",
                    })

                    if (confirmed) deletePromotion.mutate()
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
          <Heading level="h2">Discount</Heading>
        </div>
        <SectionRow label="Discount">{describeDiscount(promotion)}</SectionRow>
        {buyGet ? (
          <>
            <SectionRow label={`Customer buys ${method.buy_rules_min_quantity ?? 1} of`}>
              {describeItems(promotion.buy_rules, "items")}
            </SectionRow>
            <SectionRow label={`Customer gets ${method.apply_to_quantity ?? 1} of`}>
              {describeItems(promotion.target_rules, "items")}
            </SectionRow>
          </>
        ) : (
          <SectionRow label="Applies to">
            {describeItems(promotion.target_rules, method.target_type)}
          </SectionRow>
        )}
        {method.allocation === "each" && method.max_quantity && !buyGet && (
          <SectionRow label="Items per order">{method.max_quantity}</SectionRow>
        )}
        <SectionRow label="Who can use it">{describeWho(promotion)}</SectionRow>
        <SectionRow label="Uses">{describeUses(promotion)}</SectionRow>
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Campaign</Heading>
        </div>
        {campaign ? (
          <>
            <SectionRow label="Campaign">
              <Link
                className="text-ui-fg-interactive"
                to={`/merchant-campaigns/${campaign.id}`}
              >
                {campaign.name}
              </Link>
            </SectionRow>
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
          </>
        ) : (
          <div className="px-6 py-4">
            <Text size="small" className="text-ui-fg-subtle">
              Not in a campaign. It runs until you deactivate it.
            </Text>
          </div>
        )}
      </Container>

      {canEdit && (
        <EditPromotionDrawer
          session={session}
          promotion={promotion}
          open={editOpen}
          onOpenChange={setEditOpen}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

const MerchantPromotionDetailsPage = () => (
  <MerchantRoute>
    {(session) => <PromotionDetailsContent session={session} />}
  </MerchantRoute>
)

export const handle = { breadcrumb: () => "Promotion details" }

export default MerchantPromotionDetailsPage
