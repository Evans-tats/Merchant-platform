import { listCategories } from "@lib/data/categories"
import { listCollections } from "@lib/data/collections"
import {
  retrieveMerchantConfiguration,
  retrieveMerchantTheme,
} from "@lib/data/merchant"
import { PLATFORM_NAME } from "@lib/constants"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Text, clx } from "@modules/common/components/ui"
import StoreIdentity from "@modules/layout/components/store-identity"
import TrustStrip from "@modules/layout/components/trust-strip"

const shopLinks = [
  { label: "All products", href: "/store" },
  { label: "Cart", href: "/cart" },
  { label: "Account", href: "/account" },
]

export default async function Footer() {
  const [{ collections }, productCategories, merchant, theme] =
    await Promise.all([
      listCollections({ fields: "*products" }),
      listCategories(),
      retrieveMerchantConfiguration(),
      retrieveMerchantTheme(),
    ])
  const branding = theme?.configuration?.branding
  const storeName = branding?.name || merchant.name
  const topCategories = productCategories
    ?.filter((category) => !category.parent_category)
    .slice(0, 6)

  return (
    <footer className="mt-10 w-full small:mt-16">
      <TrustStrip />
      <div className="bg-brand-950 text-brand-200">
        <div className="content-container flex flex-col gap-10 py-12 small:flex-row small:justify-between small:py-16">
          <div className="flex max-w-sm flex-col gap-4">
            <LocalizedClientLink href="/" className="w-fit rounded-full">
              <StoreIdentity
                name={storeName}
                logoUrl={branding?.logo_url}
                tone="dark"
              />
            </LocalizedClientLink>
            {branding?.description && (
              <p className="text-sm">{branding.description}</p>
            )}
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-brand-400"
              />
              Pay securely with M-PESA
            </span>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm small:grid-cols-3 small:gap-16">
            <FooterColumn title="Shop">
              {shopLinks.map((link) => (
                <li key={link.href}>
                  <FooterLink href={link.href}>{link.label}</FooterLink>
                </li>
              ))}
            </FooterColumn>
            {topCategories?.length > 0 && (
              <FooterColumn title="Categories" data-testid="footer-categories">
                {topCategories.map((category) => (
                  <li key={category.id}>
                    <FooterLink
                      href={"/categories/" + category.handle}
                      data-testid="category-link"
                    >
                      {category.name}
                    </FooterLink>
                  </li>
                ))}
              </FooterColumn>
            )}
            {collections.length > 0 && (
              <FooterColumn title="Collections">
                {collections.slice(0, 6).map((collection) => (
                  <li key={collection.id}>
                    <FooterLink href={"/collections/" + collection.handle}>
                      {collection.title}
                    </FooterLink>
                  </li>
                ))}
              </FooterColumn>
            )}
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="content-container flex flex-col gap-2 py-6 text-xs xsmall:flex-row xsmall:items-center xsmall:justify-between">
            <Text className="txt-compact-small">
              © {new Date().getFullYear()} {storeName}. All rights reserved.
            </Text>
            <Text className="txt-compact-small">
              Powered by{" "}
              <span className="whitespace-nowrap font-bold text-white">
                {PLATFORM_NAME}
              </span>
            </Text>
          </div>
        </div>
      </div>
    </footer>
  )
}

const FooterColumn = ({
  title,
  children,
  className,
  "data-testid": dataTestId,
}: {
  title: string
  children: React.ReactNode
  className?: string
  "data-testid"?: string
}) => (
  <div className={clx("flex flex-col gap-3", className)}>
    <span className="text-xs font-bold uppercase tracking-wider text-white">
      {title}
    </span>
    <ul className="flex flex-col gap-2" data-testid={dataTestId}>
      {children}
    </ul>
  </div>
)

const FooterLink = ({
  href,
  children,
  ...props
}: {
  href: string
  children: React.ReactNode
  "data-testid"?: string
}) => (
  <LocalizedClientLink
    href={href}
    className="transition-colors hover:text-white"
    {...props}
  >
    {children}
  </LocalizedClientLink>
)
