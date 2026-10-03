import type { MedusaRequest } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"

import type {
  MerchantMemberRole,
  StaffMerchantContext,
  StoreMerchantContext,
} from "../../services/tenant-resolution"

const contextKey = "merchant_tenant"

type RequestTenantContext = {
  staff?: StaffMerchantContext
  store?: StoreMerchantContext
}

export function setStaffMerchantContext(
  request: MedusaRequest,
  context: StaffMerchantContext
): void {
  setTenantContext(request, { staff: context })
}

export function setStoreMerchantContext(
  request: MedusaRequest,
  context: StoreMerchantContext
): void {
  setTenantContext(request, { store: context })
}

export function getStaffMerchantContext(
  request: MedusaRequest
): StaffMerchantContext {
  const context = getTenantContext(request).staff

  if (!context) {
    throw new MedusaError(
      MedusaError.Types.UNAUTHORIZED,
      "Merchant staff context was not resolved"
    )
  }

  return context
}

export function getStoreMerchantContext(
  request: MedusaRequest
): StoreMerchantContext {
  const context = getTenantContext(request).store

  if (!context) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Storefront not found"
    )
  }

  return context
}

export function requireMerchantRole(
  request: MedusaRequest,
  roles: readonly MerchantMemberRole[]
): StaffMerchantContext {
  const context = getStaffMerchantContext(request)

  if (!roles.includes(context.member.role)) {
    throw new MedusaError(
      MedusaError.Types.FORBIDDEN,
      "Merchant member does not have permission for this operation"
    )
  }

  return context
}

function setTenantContext(
  request: MedusaRequest,
  update: RequestTenantContext
): void {
  request.context = {
    ...request.context,
    [contextKey]: {
      ...getTenantContext(request),
      ...update,
    },
  }
}

function getTenantContext(request: MedusaRequest): RequestTenantContext {
  return (request.context?.[contextKey] ?? {}) as RequestTenantContext
}
