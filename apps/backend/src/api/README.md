# Custom API Routes

An API Route is a REST API endpoint.

An API Route is created in a TypeScript or JavaScript file under the `/src/api` directory of your Medusa application. The file’s name must be `route.ts` or `route.js`.

> Learn more about API Routes in [this documentation](https://docs.medusajs.com/learn/fundamentals/api-routes)

For example, to create a `GET` API Route at `/store/hello-world`, create the file `src/api/store/hello-world/route.ts` with the following content:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  res.json({
    message: "Hello world!",
  });
}
```

## Supported HTTP methods

The file based routing supports the following HTTP methods:

- GET
- POST
- PUT
- PATCH
- DELETE
- OPTIONS
- HEAD

You can define a handler for each of these methods by exporting a function with the name of the method in the paths `route.ts` file.

For example:

```ts
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  // Handle GET requests
}

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  // Handle POST requests
}

export async function PUT(req: MedusaRequest, res: MedusaResponse) {
  // Handle PUT requests
}
```

## Parameters

To create an API route that accepts a path parameter, create a directory within the route's path whose name is of the format `[param]`.

For example, if you want to define a route that takes a `productId` parameter, you can do so by creating a file called `/api/products/[productId]/route.ts`:

```ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { productId } = req.params;

  res.json({
    message: `You're looking for product ${productId}`
  })
}
```

To create an API route that accepts multiple path parameters, create within the file's path multiple directories whose names are of the format `[param]`.

For example, if you want to define a route that takes both a `productId` and a `variantId` parameter, you can do so by creating a file called `/api/products/[productId]/variants/[variantId]/route.ts`.

## Using the container

The Medusa container is available on `req.scope`. Use it to access modules' main services and other registered resources:

```ts
import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"

export const GET = async (
  req: MedusaRequest,
  res: MedusaResponse
) => {
  const productModuleService = req.scope.resolve("product")

  const [, count] = await productModuleService.listAndCount()

  res.json({
    count,
  })
}
```

## Middleware

You can apply middleware to your routes by creating a file called `/api/middlewares.ts`. This file must export a configuration object with what middleware you want to apply to which routes.

For example, if you want to apply a custom middleware function to the `/store/custom` route, you can do so by adding the following to your `/api/middlewares.ts` file:

```ts
import { defineMiddlewares } from "@medusajs/framework/http"
import type {
  MedusaRequest,
  MedusaResponse,
  MedusaNextFunction,
} from "@medusajs/framework/http";

async function logger(
  req: MedusaRequest,
  res: MedusaResponse,
  next: MedusaNextFunction
) {
  console.log("Request received");
  next();
}

export default defineMiddlewares({
  routes: [
    {
      matcher: "/store/custom",
      middlewares: [logger],
    },
  ],
})
```

The `matcher` property can be either a string or a regular expression. The `middlewares` property accepts an array of middleware functions.

## Merchant route boundaries

`src/api/middlewares.ts` establishes three independent boundaries:

- Standard `/admin/*` endpoints require the Medusa RBAC
  `role_super_admin` role. Secret admin API keys are treated as platform
  credentials.
- `/admin/merchants/:merchantId/*` endpoints require an active
  `MerchantMember` for the authenticated user. The path ID only selects a
  merchant; membership authorizes it.
- Tenant storefront endpoints resolve an active merchant from `Host` and
  `x-publishable-api-key`, then require the key's only sales channel to be the
  merchant's primary channel.

RBAC is enabled in `medusa-config.ts`. Create platform operators with the
Medusa user command so they receive `role_super_admin`. Merchant staff users
must be created through the merchant onboarding flow without that platform
role.

Merchant management endpoints currently include:

```text
GET|POST /admin/merchants/:merchantId
GET  /admin/merchants/:merchantId/{products,orders,inventory,members,customers,theme,domains,payments}
POST /admin/merchants/:merchantId/{members,theme,domains,payments}
POST /admin/merchants/:merchantId/domains/:domainId/verify
POST /admin/merchants/:merchantId/members/:memberId
POST /admin/merchants/:merchantId/products
GET  /admin/merchants/:merchantId/products/:productId
POST /admin/merchants/:merchantId/products/:productId
GET|POST /admin/merchants/:merchantId/{categories,collections}
POST /admin/merchants/:merchantId/inventory
POST /admin/merchants/:merchantId/inventory/locations
POST /admin/merchants/:merchantId/inventory/locations/:locationId
POST /admin/merchants/:merchantId/orders/:orderId/cancel
POST /admin/merchants/:merchantId/orders/:orderId/fulfillments
POST /admin/merchants/:merchantId/orders/:orderId/payments/:paymentId/refund
```

Storefront metadata endpoints are:

```text
GET /storefront/configuration?hostname=shop.example.com
GET /store/merchant
GET /store/merchant/pages
GET /store/merchant/theme
```

The standard Medusa store product, category, collection, cart, and order paths
also run merchant middleware. Product lists and details require both an
ownership link and availability in the resolved sales channel. Cart creation
links the cart to the merchant, and every line-item addition repeats the
variant's product ownership, inventory-location, and sales-channel checks.
Completing a cart repeats those validations before the order is synchronously
linked to its merchant.

The public `/storefront/configuration` bootstrap endpoint returns only the
active merchant's public storefront identity, primary sales channel, and
publishable key. The storefront then repeats the hostname with every Store API
request; the key remains public but is never shared across tenant contexts.

Merchant invitations are created without Medusa RBAC roles. Accepting an
invitation creates an active `MerchantMember`; it does not grant access to
standard Medusa Admin endpoints. The merchant workspace is available at
`/:countryCode/merchant-admin` in the storefront and only calls the custom
merchant-scoped endpoints.
