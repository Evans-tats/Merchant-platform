import { defineRouteConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  DataTable,
  FocusModal,
  Heading,
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
  type MerchantCampaign,
  type MerchantCampaignListResponse,
  type MerchantSession,
} from "../../../lib/merchant-api"
import {
  CAMPAIGN_STATUS_BADGES,
  budgetPercent,
  campaignFormProblem,
  campaignPayload,
  describeBudget,
  describeCampaignDates,
  emptyCampaignForm,
  type CampaignFormState,
} from "../../../lib/merchant-promotions"
import { BudgetBar, CampaignFields } from "../promotions/promotion-form"

const columnHelper = createDataTableColumnHelper<MerchantCampaign>()

const CreateCampaignModal = ({
  session,
  currencyCode,
  open,
  onOpenChange,
}: {
  session: MerchantSession
  currencyCode: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) => {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState<CampaignFormState>(emptyCampaignForm)
  const problem = campaignFormProblem(form)
  const createCampaign = useMutation({
    mutationFn: () =>
      merchantApi.post<{ campaign: MerchantCampaign }>(
        session.merchant.id,
        "/campaigns",
        campaignPayload(form, currencyCode)
      ),
    onSuccess: async ({ campaign }) => {
      await queryClient.invalidateQueries({
        queryKey: merchantQueryKeys.resource(session.merchant.id, "campaigns"),
      })
      toast.success(`Created campaign ${campaign.name}`)
      onOpenChange(false)
      setForm(emptyCampaignForm())
      navigate(`/merchant-campaigns/${campaign.id}`)
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <form
          className="flex h-full flex-col overflow-hidden"
          onSubmit={(event) => {
            event.preventDefault()
            if (!problem) createCampaign.mutate()
          }}
        >
          <FocusModal.Header>
            <div className="flex w-full items-center justify-end gap-x-2">
              <FocusModal.Close asChild>
                <Button size="small" variant="secondary" type="button">
                  Cancel
                </Button>
              </FocusModal.Close>
              <Button
                size="small"
                type="submit"
                disabled={Boolean(problem)}
                isLoading={createCampaign.isPending}
              >
                Create
              </Button>
            </div>
          </FocusModal.Header>
          <FocusModal.Body className="flex flex-1 justify-center overflow-y-auto px-6 py-16">
            <div className="flex w-full max-w-lg flex-col gap-y-8">
              <div className="flex flex-col gap-y-1">
                <Heading>Create campaign</Heading>
                <Text size="small" className="text-ui-fg-subtle">
                  Group promotions under shared dates and a budget. When the
                  campaign ends or its budget runs out, its promotions stop.
                </Text>
              </div>
              <CampaignFields
                idPrefix="create-campaign"
                campaign={form}
                currencyCode={currencyCode}
                onChange={(change) => setForm((current) => ({ ...current, ...change }))}
              />
            </div>
          </FocusModal.Body>
        </form>
      </FocusModal.Content>
    </FocusModal>
  )
}

const MerchantCampaignsContent = ({ session }: { session: MerchantSession }) => {
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 })
  const deferredSearch = useDeferredValue(search)
  const canEdit = canManageMerchant(session.member.role)
  const limit = pagination.pageSize
  const offset = pagination.pageIndex * limit
  const campaignsQuery = useQuery({
    queryKey: [
      ...merchantQueryKeys.resource(session.merchant.id, "campaigns"),
      limit,
      offset,
      deferredSearch,
    ],
    queryFn: () => {
      const parameters = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      })

      if (deferredSearch.trim()) parameters.set("q", deferredSearch.trim())

      return merchantApi.get<MerchantCampaignListResponse>(
        session.merchant.id,
        `/campaigns?${parameters.toString()}`
      )
    },
    placeholderData: keepPreviousData,
  })
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Campaign",
        cell: ({ row, getValue }) => (
          <Link
            className="font-medium text-ui-fg-interactive"
            to={`/merchant-campaigns/${row.original.id}`}
          >
            {getValue()}
          </Link>
        ),
      }),
      columnHelper.display({
        id: "dates",
        header: "Dates",
        cell: ({ row }) => describeCampaignDates(row.original),
      }),
      columnHelper.display({
        id: "budget",
        header: "Budget",
        cell: ({ row }) => (
          <div className="flex min-w-40 flex-col gap-y-1">
            <Text size="small" leading="compact">
              {describeBudget(row.original.budget)}
            </Text>
            <BudgetBar percent={budgetPercent(row.original.budget)} />
          </div>
        ),
      }),
      columnHelper.accessor("promotion_count", { header: "Promotions" }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: ({ getValue }) => {
          const badge = CAMPAIGN_STATUS_BADGES[getValue()]
          return <StatusBadge color={badge.color}>{badge.label}</StatusBadge>
        },
      }),
    ],
    []
  )
  const table = useDataTable({
    columns,
    data: campaignsQuery.data?.campaigns ?? [],
    getRowId: (campaign) => campaign.id,
    rowCount: campaignsQuery.data?.count ?? 0,
    isLoading: campaignsQuery.isPending,
    search: {
      state: search,
      onSearchChange: (value) => {
        setSearch(value)
        setPagination((current) => ({ ...current, pageIndex: 0 }))
      },
    },
    pagination: { state: pagination, onPaginationChange: setPagination },
  })

  if (campaignsQuery.isError) {
    throw campaignsQuery.error
  }

  return (
    <Container className="divide-y p-0">
      <MerchantPageHeader
        title="Campaigns"
        subtitle="Shared dates and budgets for your promotions"
        actions={
          canEdit && (
            <Button size="small" variant="secondary" onClick={() => setCreateOpen(true)}>
              Create campaign
            </Button>
          )
        }
      />
      <DataTable instance={table}>
        <DataTable.Toolbar>
          <div className="min-w-64 flex-1">
            <DataTable.Search placeholder="Search campaigns" />
          </div>
        </DataTable.Toolbar>
        <DataTable.Table
          emptyState={{
            empty: {
              heading: "No campaigns yet",
              description:
                "Create a campaign such as Black Friday to run promotions between two dates.",
            },
            filtered: {
              heading: "No matching campaigns",
              description: "Try another search.",
            },
          }}
        />
        <DataTable.Pagination />
      </DataTable>
      {canEdit && (
        <CreateCampaignModal
          session={session}
          currencyCode={campaignsQuery.data?.currency_codes[0] ?? "kes"}
          open={createOpen}
          onOpenChange={setCreateOpen}
        />
      )}
    </Container>
  )
}

const MerchantCampaignsPage = () => (
  <MerchantRoute>
    {(session) => <MerchantCampaignsContent session={session} />}
  </MerchantRoute>
)

export const config = defineRouteConfig({})

export const handle = {
  breadcrumb: () => "Campaigns",
}

export default MerchantCampaignsPage
