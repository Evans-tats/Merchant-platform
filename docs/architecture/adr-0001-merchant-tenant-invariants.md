# ADR-0001: Merchant Tenant Invariants

- Status: Accepted
- Date: 2026-09-05
- Scope: Backend APIs, storefront requests, workflows, background jobs, caches, and merchant administration

## Context

The platform hosts multiple merchants in one Medusa application and database. Each merchant owns its storefront configuration and commerce records, while shopper authentication identities may be used across more than one merchant.

Tenant isolation is an application security boundary. A sales channel, publishable API key, hostname, resource identifier, or client-provided merchant identifier can help select context, but none of them is sufficient authorization on its own.

This decision defines the invariants that all merchant-aware code must preserve. Later architecture decisions may strengthen these controls, but they must not weaken them without an explicit security review and replacement ADR.

## Definitions

- **Merchant**: The primary tenant and ownership boundary.
- **Platform administrator**: An authenticated operator explicitly authorized to work across merchants.
- **Merchant member**: An authenticated owner or staff member with an active membership and role in one merchant.
- **Shopper identity**: A global authentication identity that may have a separate customer profile in each merchant.
- **Storefront context**: The active merchant resolved from the request hostname and checked against the request's storefront credentials.
- **Merchant-owned resource**: Data that may be accessed only in one merchant context, including profiles, addresses, carts, orders, products, inventory, domains, themes, members, and payment configuration.

## Decision

### 1. One Shared Medusa Application and Database

The platform runs one shared Medusa application and database for all merchants.

This means:

- Tenant isolation must not depend on a separate process, schema, or database connection per merchant.
- Every merchant-owned record must have an enforceable association with exactly one merchant, either in the Merchant module or through a Medusa module link.
- Tenant context must be carried through routes, workflows, workflow steps, subscribers, scheduled jobs, and cache operations.
- Ordinary tenant-scoped code must not perform unscoped queries over merchant-owned resources.
- Cross-merchant platform operations must use a separate, explicitly authorized platform-administrator path and produce an audit record.

Adding a resource ID to a request does not establish ownership. The resource must be loaded through, or checked against, the verified merchant context.

### 2. The Request Hostname Selects the Storefront Merchant

For storefront traffic, the request hostname selects the candidate merchant.

Hostname resolution must:

1. Normalize the hostname by removing the port and trailing dot and converting it to lowercase.
2. Match an active, verified, globally unique merchant-domain record.
3. Resolve an active merchant.
4. Load that merchant's storefront configuration, primary sales channel, and publishable API key association.
5. Reject requests where the hostname, publishable key, merchant, and sales channel do not agree.

Only proxy-forwarded host information from trusted platform infrastructure may be used. An arbitrary forwarding header supplied directly by a client must not override the hostname.

An unknown, unverified, disabled, or detached hostname returns `404`. Hostname resolution selects tenant context; it does not authenticate a shopper or authorize access to non-public records.

### 3. Merchant Staff Access Requires Authenticated Membership

Merchant administration requires all of the following:

- An authenticated actor.
- An active merchant.
- An active membership connecting the actor to that merchant.
- A role that permits the requested action.
- Verified ownership of every resource affected by the action.

A merchant identifier in a path, header, query string, form, or JSON body is only a selector. It must be checked against the authenticated actor's membership.

Standard Medusa administrator APIs are reserved for platform administrators unless an endpoint has an explicit merchant-aware authorization boundary. Merchant owners and staff use merchant-scoped APIs and must never gain cross-merchant access merely by possessing ordinary Medusa admin credentials.

### 4. Shopper Identity Is Global and Store Data Is Merchant-Specific

A shopper may authenticate with one global identity and have a distinct customer profile at each merchant.

The following data is merchant-specific:

- Customer profile and status.
- Saved addresses and preferences.
- Carts.
- Orders and order history.
- Store-specific consent and communication preferences.

Access to shopper data requires both the authenticated shopper identity and the verified merchant context. Matching only `customer_id`, email address, cart ID, order ID, or transfer token is insufficient.

Creating a customer profile for an identity that already exists must require successful authentication. The platform must not reveal whether the same email address has an identity or profile at another merchant.

A cart and order belong to one merchant. Mixed-merchant carts are prohibited, and merchant ownership must be preserved when a cart becomes an order.

### 5. Sales Channels Assist Scoping but Are Not Authorization

Every merchant has a primary Medusa sales channel and a publishable API key associated with that channel. These provide storefront request context and catalog scoping, but they are not tenant authorization controls.

Therefore:

- A publishable API key is treated as public client configuration.
- Product listing requires the product to belong to the merchant and be available in the merchant's sales channel.
- Product detail and add-to-cart operations repeat both checks, even if the product was absent from a previous listing response.
- Inventory operations require merchant ownership of both the product and the relevant stock location.
- Order operations require merchant ownership even when the order has the expected sales channel.
- A mismatched hostname, publishable key, sales channel, or resource association is rejected.

No workflow or route may use a sales channel as the sole proof that a caller can access a merchant-owned resource.

### 5.1. Commerce Ownership Uses Explicit Module Links

The Merchant module is the source of tenant ownership. Stored Medusa module
links enforce these cardinalities:

- A merchant has one primary sales channel, and that sales channel belongs to
  one merchant.
- A merchant has many products, product categories, product collections,
  carts, orders, stock locations, and shipping profiles, while each of those
  records has one owning merchant.
- A merchant customer profile references one global Customer by `customer_id`.
  One Customer may be referenced by profiles at multiple merchants.
- A merchant member references one authenticated User actor by `actor_id`. A
  User may hold memberships at multiple merchants.
- A merchant customer profile remains unique on `(merchant_id, customer_id)`.

The Customer and User associations are read-only module links because their IDs
are already stored on Merchant records. Creating separate pivot records would
introduce a second source of truth.

Product categories, product collections, carts, and shipping profiles now use
explicit merchant links. Price lists, fulfillment sets, service zones, and
other merchant-configurable fulfillment settings must become explicitly
merchant-owned before merchant-facing APIs can create or manage them. Until
those ownership associations and authorization checks exist, those resources
remain platform-administrator-only.

Module-link cardinality is a data-integrity control. Routes and workflows must
still authorize the resolved merchant before reading or mutating linked records.

### 6. Cross-Merchant Access Is Concealed Where Possible

When an authenticated tenant-scoped caller requests a resource belonging to another merchant, the API returns `404` where practical. This prevents confirmation that another merchant's resource exists.

The general response policy is:

| Condition | Response |
| --- | --- |
| Missing or invalid authentication where authentication is required | `401` |
| Authenticated member lacks permission for an action within the current merchant | `403` |
| Resource is absent or belongs to a different merchant | `404` |
| Storefront hostname is unknown, unverified, or inactive | `404` |

Logs may record the internal denial reason, verified merchant ID, actor ID, and correlation ID. Client responses must not expose another merchant's identifiers or private attributes.

### 7. Suspended Merchants Cannot Transact

Merchant status is checked at the start of every tenant-scoped request and rechecked before sensitive workflow steps.

A suspended merchant cannot:

- Create or modify carts.
- Initiate or capture payments.
- Place, fulfill, cancel, refund, or transfer orders.
- Change products, prices, inventory, domains, themes, members, or payment configuration through merchant APIs.
- Run merchant-scoped jobs that create external side effects.

The storefront may show a read-only suspension or maintenance response, but it must not expose private merchant or shopper data. Platform administrators may perform explicitly authorized recovery actions, and those actions must be audited.

## Supporting Security Rules

The following rules apply wherever tenant-scoped data is processed:

- Cache keys include the verified merchant ID, for example `merchant:{merchantId}:theme`.
- Files and object-storage keys use a merchant-specific namespace.
- Queue messages include the verified merchant ID, and consumers reload and validate merchant and resource ownership before acting.
- Idempotency keys for tenant actions are scoped by merchant.
- Rate limits protect both the whole platform and individual merchants.
- Logs use the verified merchant ID rather than an untrusted client value.
- Authentication headers, cookies, shopper personal data, and payment credentials are not written to logs.
- Storefront session cookies are host-only and must not use a parent domain shared by merchant subdomains.

## Required Authorization Flow

Storefront requests follow this sequence:

```text
request hostname
  -> verified active domain
  -> active merchant
  -> matching publishable key and sales channel
  -> merchant-owned resource check
  -> operation-specific authorization
```

Merchant administration follows this sequence:

```text
authenticated actor
  -> active merchant membership
  -> role permission
  -> merchant-owned resource check
  -> workflow execution
```

Background work follows this sequence:

```text
authorized producer
  -> message with verified merchant context
  -> consumer reloads merchant
  -> consumer revalidates resource ownership and status
  -> side effect
```

## Mandatory Isolation Tests

Integration tests must create at least two merchants and prove that:

- Merchant A's hostname and publishable key cannot list, retrieve, or purchase Merchant B's products.
- Merchant A's shopper cannot access Merchant B's profile, addresses, carts, or orders.
- Merchant A's member cannot list, read, update, delete, fulfill, refund, or configure Merchant B's records.
- Supplying a forged merchant ID does not change the verified tenant context.
- Combining one merchant's hostname with another merchant's publishable key is rejected.
- Reusing a cache entry or worker process across tenants does not leak tenant context.
- Suspended merchants cannot perform transactional or administrative mutations.
- Platform-administrator cross-merchant actions require explicit authorization and produce audit records.

Tests must cover list endpoints as well as lookups by known resource ID. A list that silently includes another merchant's record is an isolation failure.

## Consequences

- Merchant-aware workflows and APIs require explicit ownership checks, even when Medusa already filters by sales channel.
- Shopper authentication can be shared, but shopper commerce data cannot be queried globally in a storefront context.
- Merchant staff cannot safely use unrestricted Medusa administrator endpoints.
- Background processing, caching, and observability must preserve verified tenant context.
- Development fixtures and automated tests must always contain at least two merchants.

These costs are accepted because application-enforced isolation is the primary security boundary in the shared application and database architecture.
