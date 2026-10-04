import {
  defineMiddlewares,
  validateAndTransformBody,
} from "@medusajs/framework/http"
import { z } from "@medusajs/framework/zod"

import {
  assertStoreCart,
  assertStoreCartLineItemProduct,
  assertStoreOwnedDetail,
  assertStoreOrder,
  assertStoreProductDetail,
  assertStorePromotionCodes,
  assertStoreShippingOptionsCart,
  prepareStoreCartCreate,
  requirePlatformAdministrator,
  resolveStaffMerchantMiddleware,
  resolveStoreMerchantMiddleware,
  scopeStoreOwnedList,
  scopeStoreOrderList,
  scopeStoreProductOptionList,
  scopeStoreProductList,
} from "./middlewares/merchant-tenancy"
import { merchantOrderFulfillmentMiddlewares } from "./admin/merchants/[merchantId]/orders/[orderId]/fulfillments/middlewares"
import { merchantOrderDeliveryMiddlewares } from "./admin/merchants/[merchantId]/orders/[orderId]/fulfillments/[fulfillmentId]/deliver/middlewares"
import { merchantOrderShipmentMiddlewares } from "./admin/merchants/[merchantId]/orders/[orderId]/shipments/middlewares"
import { merchantProductMiddlewares } from "./admin/merchants/[merchantId]/products/middlewares"
import { merchantCustomerMiddlewares } from "./admin/merchants/[merchantId]/customers/middlewares"
import { merchantCustomerSegmentMiddlewares } from "./admin/merchants/[merchantId]/customer-segments/middlewares"
import { merchantPromotionMiddlewares } from "./admin/merchants/[merchantId]/promotions/middlewares"
import { merchantCampaignMiddlewares } from "./admin/merchants/[merchantId]/campaigns/middlewares"
import { merchantCollectionMiddlewares } from "./admin/merchants/[merchantId]/collections/middlewares"
import { merchantCategoryMiddlewares } from "./admin/merchants/[merchantId]/categories/middlewares"
import { merchantUploadMiddlewares } from "./admin/merchants/[merchantId]/uploads/middlewares"
import { merchantProductDraftMiddlewares } from "./admin/merchants/[merchantId]/product-drafts/middlewares"
import { merchantSessionMiddlewares } from "./admin/merchant-session/middlewares"
import { merchantHomeMiddlewares } from "./admin/merchants/[merchantId]/home/middlewares"
import { merchantAssistantMiddlewares } from "./admin/merchants/[merchantId]/assistant/middlewares"

export default defineMiddlewares({
  routes: [
    {
      matcher:
        /^\/admin(?!\/(?:merchants\/[^/]+|merchant-session|invites\/accept|users\/me|feature-flags|rbac\/me\/permissions|layouts)(?:\/|$))(?:\/|$)/,
      middlewares: [requirePlatformAdministrator],
    },
    {
      // Merchant staff read the admin layout so the dashboard applies the
      // platform default (e.g. the hidden core topbar bell). Saving stays
      // platform-only: Medusa lets any caller set the default for every tenant.
      matcher: "/admin/layouts/*",
      method: ["POST", "DELETE"],
      middlewares: [requirePlatformAdministrator],
    },
    {
      matcher: "/admin/merchants/*",
      middlewares: [resolveStaffMerchantMiddleware],
    },
    {
      matcher: "/store/merchant*",
      middlewares: [resolveStoreMerchantMiddleware],
    },
    {
      matcher: "/store/customers/me*",
      middlewares: [resolveStoreMerchantMiddleware],
    },
    {
      matcher: "/store/products",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        scopeStoreProductList,
      ],
    },
    {
      matcher: "/store/products/:id",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreProductDetail,
      ],
    },
    {
      matcher: "/store/product-options",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        scopeStoreProductOptionList,
      ],
    },
    {
      matcher: "/store/product-categories",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        scopeStoreOwnedList("product_category"),
      ],
    },
    {
      matcher: "/store/product-categories/:id",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreOwnedDetail("product_category"),
      ],
    },
    {
      matcher: "/store/collections",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        scopeStoreOwnedList("product_collection"),
      ],
    },
    {
      matcher: "/store/collections/:id",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreOwnedDetail("product_collection"),
      ],
    },
    {
      matcher: "/store/carts",
      methods: ["POST"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        prepareStoreCartCreate,
        assertStorePromotionCodes,
      ],
    },
    {
      matcher: "/store/carts/*",
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreCart,
      ],
    },
    {
      matcher: "/store/carts/:id/line-items",
      methods: ["POST"],
      middlewares: [assertStoreCartLineItemProduct],
    },
    {
      matcher: "/store/carts/:id",
      methods: ["POST"],
      middlewares: [assertStorePromotionCodes],
    },
    {
      matcher: "/store/carts/:id/promotions",
      methods: ["POST"],
      middlewares: [assertStorePromotionCodes],
    },
    {
      matcher: "/store/shipping-options",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreShippingOptionsCart,
      ],
    },
    {
      matcher: "/store/shipping-options/:id/calculate",
      methods: ["POST"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreShippingOptionsCart,
      ],
    },
    {
      matcher: "/store/orders",
      methods: ["GET"],
      middlewares: [
        resolveStoreMerchantMiddleware,
        scopeStoreOrderList,
      ],
    },
    {
      matcher: "/store/orders/*",
      middlewares: [
        resolveStoreMerchantMiddleware,
        assertStoreOrder,
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            name: z.string().trim().min(1).max(255),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/members",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            email: z.string().trim().email(),
            role: z.enum(["admin", "staff"]),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/members/:memberId",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z
            .object({
              role: z.enum(["owner", "admin", "staff"]).optional(),
              status: z.enum(["active", "suspended"]).optional(),
            })
            .refine(
              ({ role, status }) =>
                role !== undefined || status !== undefined,
              "A role or status update is required"
            )
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/theme",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            configuration: z.record(z.string(), z.unknown()),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/domains",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            hostname: z.string().trim().min(1).max(253),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/payments",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            provider: z.enum(["mpesa_stk", "mpesa_paybill"]),
            mode: z.enum(["sandbox", "production"]),
            status: z.enum(["disabled", "active"]),
            public_configuration: z.record(z.string(), z.unknown()),
            secret_reference: z.string().trim().min(1).nullable().optional(),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/shipping-profiles",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            shipping_profiles: z.array(z.object({
              name: z.string().trim().min(1),
              type: z.string().trim().min(1),
            })).min(1),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/delivery-options*",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            name: z.string().trim().min(1).max(255),
            description: z.string().trim().max(500).nullable().optional(),
            estimated_delivery: z
              .string()
              .trim()
              .max(120)
              .nullable()
              .optional(),
            stock_location_id: z.string().min(1),
            shipping_profile_id: z.string().min(1),
            country_codes: z
              .array(
                z.string().trim().toLowerCase().regex(/^[a-z]{2}$/)
              )
              .min(1)
              .max(100),
            price: z.object({
              amount: z.number().nonnegative(),
              currency_code: z
                .string()
                .trim()
                .toLowerCase()
                .regex(/^[a-z]{3}$/),
            }),
            is_enabled: z.boolean(),
            is_default: z.boolean(),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/draft-orders",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            email: z.string().email(),
            items: z.array(z.object({
              variant_id: z.string().min(1),
              quantity: z.number().int().positive(),
            })).min(1),
          })
        ),
      ],
    },
    ...merchantOrderFulfillmentMiddlewares,
    ...merchantOrderDeliveryMiddlewares,
    ...merchantOrderShipmentMiddlewares,
    ...merchantProductMiddlewares,
    ...merchantCustomerMiddlewares,
    ...merchantCustomerSegmentMiddlewares,
    ...merchantPromotionMiddlewares,
    ...merchantCampaignMiddlewares,
    ...merchantCollectionMiddlewares,
    ...merchantCategoryMiddlewares,
    ...merchantUploadMiddlewares,
    ...merchantProductDraftMiddlewares,
    ...merchantSessionMiddlewares,
    ...merchantHomeMiddlewares,
    ...merchantAssistantMiddlewares,
    {
      matcher:
        "/admin/merchants/:merchantId/orders/:orderId/payments/:paymentId/refund",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            amount: z.number().positive(),
            refund_reason_id: z.string().min(1).optional(),
            note: z.string().optional(),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/orders/:orderId/exchanges",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            description: z.string().trim().max(1000).optional(),
            internal_note: z.string().trim().max(1000).optional(),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/orders/:orderId/returns",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            items: z
              .array(
                z.object({
                  id: z.string().min(1),
                  quantity: z.number().positive(),
                  reason_id: z.string().min(1).nullable().optional(),
                  note: z.string().max(1000).nullable().optional(),
                })
              )
              .min(1),
            note: z.string().max(1000).nullable().optional(),
            receive_now: z.boolean().optional(),
            refund_amount: z.number().nonnegative().optional(),
            location_id: z.string().min(1).nullable().optional(),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/orders/:orderId/notes",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({ note: z.string().trim().min(1).max(2000) })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/customers/:customerId",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            update: z.record(z.string(), z.unknown()),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/customers/:customerId/addresses",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            address: z.record(z.string(), z.unknown()),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/customers/:customerId/addresses/:addressId",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            address: z.record(z.string(), z.unknown()),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/inventory",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            create: z
              .array(z.record(z.string(), z.unknown()))
              .optional(),
            update: z
              .array(z.record(z.string(), z.unknown()))
              .optional(),
          })
        ),
      ],
    },
    {
      matcher: "/admin/merchants/:merchantId/inventory/locations",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            locations: z
              .array(z.record(z.string(), z.unknown()))
              .min(1),
          })
        ),
      ],
    },
    {
      matcher:
        "/admin/merchants/:merchantId/inventory/locations/:locationId",
      methods: ["POST"],
      middlewares: [
        validateAndTransformBody(
          z.object({
            update: z.record(z.string(), z.unknown()),
          })
        ),
      ],
    },
  ],
})
