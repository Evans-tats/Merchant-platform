import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  DataTable,
  FocusModal,
  ProgressTabs,
  Select,
  StatusBadge,
  Text,
  createDataTableColumnHelper,
  toast,
  useDataTable,
} from "@medusajs/ui"
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useDeferredValue, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import {
  MerchantPageHeader,
  MerchantRoute,
} from "../../../components/merchant/merchant-page"
import {
  canManageMerchant,
  errorMessage,
  merchantApi,
  merchantQueryKeys,
  type MerchantPromotion,
  type MerchantPromotionListResponse,
  type MerchantPromotionStatus,
  type MerchantSession,
} from "../../../lib/merchant-api"
import {
  PROMOTION_STATUS_BADGES,
  describeDiscount,
  describeItems,
  describeUses,
  describeWho,
  emptyPromotionForm,
  promotionFormProblem,
  promotionPayload,
  type PromotionFormState,
  type PromotionTemplateId,
} from "../../../lib/merchant-promotions"
import {
  CampaignChoiceFields,
  PromotionDetailsFields,
  TemplatePicker,
} from "./promotion-form"

const columnHelper = createDataTableColumnHelper<MerchantPromotion>()

type Step = "type" | "details" | "campaign"

const steps: Array<{ value: Step; label: string }> = [
  { value: "type", label: "Type" },
  { value: "details", label: "Details" },
  { value: "campaign", label: "Campaign" },
]

const CreatePromotionModal = ({
  session,
  currencies,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  currencies: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const currency = currencies[0] ?? "kes"
  const [step, setStep] = useState<Step>("type")
  const [form, setForm] = useState<PromotionFormState>(() =>
    emptyPromotionForm("percentage_off_products", currency)
  )
  const stepIndex = steps.findIndex(({ value }) => value === step)
  const problem = promotionFormProblem(form, step === "campaign" ? "campaign" : "details")
  const update = (change: Partial<PromotionFormState>) =>
    setForm((current) => ({ ...current, ...change }))
  const chooseTemplate = (template: PromotionTemplateId) =>
    setForm((current) => ({
      ...emptyPromotionForm(template, current.currency_code),
      code: current.code,
      is_automatic: current.is_automatic,
    }))
  const reset = () => {
    setStep("type")
    setForm(emptyPromotionForm("percentage_off_products", currency))
  }
  const createPromotion = useMutation({
    mutationFn: () =>
      merchantApi.post<{ promotion: MerchantPromotion }>(
        session.merchant.id,
        "/promotions",
        promotionPayload(form)
      ),
    onSuccess: async ({ promotion }) => {
      await Promise.all(
        ["promotions", "campaigns"].map((resource) =>
          queryClient.invalidateQueries({
            queryKey: merchantQueryKeys.resource(session.merchant.id, resource),
          })
        )
      )
      toast.success(`Created promotion ${promotion.code}`)
      onOpenChange(false)
      reset()
      navigate(`/merchant-promotions/${promotion.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  const canContinue = step === "type" || !problem

  return (
    <FocusModal
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <FocusModal.Content>
        <ProgressTabs
          value={step}
          onValueChange={(value) => setStep(value as Step)}
          className="flex h-full flex-col overflow-hidden"
        >
          <FocusModal.Header>
            <div className="-my-2 w-full border-l">
              <ProgressTabs.List className="flex w-full items-center justify-start">
                {steps.map(({ value, label }, index) => (
                  <ProgressTabs.Trigger
                    key={value}
                    value={value}
                    disabled={index > stepIndex && !canContinue}
                    status={
                      index < stepIndex
                        ? "completed"
                        : index === stepIndex
                          ? "in-progress"
                          : "not-started"
                    }
                  >
                    {label}
                  </ProgressTabs.Trigger>
                ))}
              </ProgressTabs.List>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-1 justify-center overflow-y-auto px-6 py-12">
            <div className="flex w-full max-w-2xl flex-col gap-y-8">
              <ProgressTabs.Content value="type" className="flex flex-col gap-y-6">
                <div className="flex flex-col gap-y-1">
                  <Text size="large" weight="plus">
                    What kind of promotion?
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    Shoppers see the discount in the cart and at checkout.
                  </Text>
                </div>
                <TemplatePicker value={form.template} onChange={chooseTemplate} />
              </ProgressTabs.Content>
              <ProgressTabs.Content value="details" className="flex flex-col gap-y-6">
                <Text size="large" weight="plus">
                  Promotion details
                </Text>
                <PromotionDetailsFields
                  merchantId={session.merchant.id}
                  form={form}
                  currencies={currencies}
                  mode="create"
                  onChange={update}
                />
              </ProgressTabs.Content>
              <ProgressTabs.Content value="campaign" className="flex flex-col gap-y-6">
                <div className="flex flex-col gap-y-1">
                  <Text size="large" weight="plus">
                    Campaign
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    A campaign gives promotions start and end dates and a budget.
                  </Text>
                </div>
                <CampaignChoiceFields
                  merchantId={session.merchant.id}
                  form={form}
                  allowNew
                  onChange={update}
                />
              </ProgressTabs.Content>
            </div>
          </FocusModal.Body>
          <FocusModal.Footer>
            <div className="flex w-full items-center justify-between gap-x-4">
              <Text size="small" className="text-ui-fg-subtle">
                {step !== "type" && problem ? problem : ""}
              </Text>
              <div className="flex items-center gap-x-2">
                <FocusModal.Close asChild>
                  <Button size="small" variant="secondary" type="button">
                    Cancel
                  </Button>
                </FocusModal.Close>
                {stepIndex > 0 && (
                  <Button
                    size="small"
                    variant="secondary"
                    type="button"
                    onClick={() => setStep(steps[stepIndex - 1].value)}
                  >
                    Back
                  </Button>
                )}
                {step === "campaign" ? (
                  <Button
                    size="small"
                    type="button"
                    disabled={Boolean(problem)}
                    isLoading={createPromotion.isPending}
                    onClick={() => createPromotion.mutate()}
                  >
                    Create promotion
                  </Button>
                ) : (
                  <Button
                    size="small"
                    type="button"
                    disabled={!canContinue}
                    onClick={() => setStep(steps[stepIndex + 1].value)}
                  >
                    Continue
                  </Button>
                )}
              </div>
            </div>
          </FocusModal.Footer>
        </ProgressTabs>
      </FocusModal.Content>
    </FocusModal>
  )
}

const statusFilters: Array<{ value: "all" | MerchantPromotionStatus; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "inactive", label: "Inactive" },
]

const MerchantPromotionsContent = ({ session }: { session: MerchantSession }) => {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<"all" | MerchantPromotionStatus>("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const deferredSearch = useDeferredValue(search)
  const canEdit = canManageMerchant(session.member.role)
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit
  const promotionsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "promotions"),
      limit,
      offset,
      deferredSearch,
      status,
    ],
    queryFn: () => {
      const parameters = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })

      if (deferredSearch.trim()) parameters.set("q", deferredSearch.trim())
      if (status !== "all") parameters.set("status", status)

      return merchantApi.get<MerchantPromotionListResponse>(
        session.merchant.id,
        `/promotions?${parameters.toString()}`
      )
    },
    placeholderData: keepPreviousData,
  })
  const columns = useMemo(
    () => [
      columnHelper.accessor("code", {
        header: "Promotion",
        cell: ({ row, getValue }) => (
          <div className="flex flex-col">
            <Link
              className="font-medium text-ui-fg-interactive"
              to={`/merchant-promotions/${row.original.id}`}
            >
              {getValue()}
            </Link>
            <Text size="xsmall" className="text-ui-fg-subtle">
              {row.original.is_automatic ? "Automatic" : "Code"}
            </Text>
          </div>
        ),
      }),
      columnHelper.display({
        id: "discount",
        header: "Discount",
        cell: ({ row }) => (
          <div className="flex flex-col">
            <Text size="small" leading="compact">
              {describeDiscount(row.original)}
            </Text>
            <Text size="xsmall" className="max-w-xs truncate text-ui-fg-subtle">
              {describeItems(
                row.original.target_rules,
                row.original.application_method.target_type
              )}
            </Text>
          </div>
        ),
      }),
      columnHelper.display({
        id: "who",
        header: "Who gets it",
        cell: ({ row }) => describeWho(row.original),
      }),
      columnHelper.display({
        id: "campaign",
        header: "Campaign",
        cell: ({ row }) => row.original.campaign?.name ?? "—",
      }),
      columnHelper.display({
        id: "uses",
        header: "Uses",
        cell: ({ row }) => describeUses(row.original),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => {
          const badge = PROMOTION_STATUS_BADGES[getValue()]
          return <StatusBadge color={badge.color}>{badge.label}</StatusBadge>
        },
      }),
    ],
    []
  )
  const table = useDataTable({
    columns,
    data: promotionsQuery.data?.promotions ?? [],
    getRowId: (promotion) => promotion.id,
    rowCount: promotionsQuery.data?.count ?? 0,
    isLoading: promotionsQuery.isPending,
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((current) => ({ ...current, pageIndex: 0 }))
      },
    },
    pagination: { state: pagination, onPaginationChange: setPagination },
  })

  if (promotionsQuery.isError) {
    throw promotionsQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Promotions"
        subtitle={`Discounts shoppers get in the cart at ${session.merchant.name}`}
        actions={
          canEdit && (
            <Button size="small" variant="secondary" onClick={() => setCreateOpen(true)}>
              Create promotion
            </Button>
          )
        }
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="flex w-full flex-wrap items-center gap-2">
            <div className="min-w-64 flex-1">
              <DataTable.Search placeholder="Search promotions" />
            </div>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value as typeof status)
                setPagination((current) => ({ ...current, pageIndex: 0 }))
              }}
            >
              <Select.Trigger className="w-40" aria-label="Filter by status">
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                {statusFilters.map(({ value, label }) => (
                  <Select.Item key={value} value={value}>
                    {label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No promotions yet",
              description:
                "Create a promotion such as 10% off a collection or a welcome code.",
            },
            filtered: {
              heading: "No matching promotions",
              description: "Try another search or status.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <CreatePromotionModal
          session={session}
          currencies={promotionsQuery.data?.currency_codes ?? []}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </Container>
  )
}

const MerchantPromotionsPage = () => (
  <MerchantRoute>
    {(session) => <MerchantPromotionsContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Promotions",
}

export default MerchantPromotionsPage
