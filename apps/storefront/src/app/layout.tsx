import {
  retrieveMerchantConfiguration,
  retrieveMerchantTheme,
} from "@lib/data/merchant"
import { getBaseURL } from "@lib/util/env"
import { CSSProperties } from "react"
import { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import "styles/globals.css"

export const dynamic = "force-dynamic"

// Figtree (SIL OFL, see fonts/figtree-OFL.txt) stands in for Safaricom's
// licensed Proxima Nova. It is vendored rather than fetched from Google Fonts
// so builds work without outbound network access. To use the licensed face,
// point src at its files and keep the variable name.
const brandFont = localFont({
  src: "./fonts/figtree-latin-wght-normal.woff2",
  weight: "300 900",
  display: "swap",
  variable: "--font-sans",
})

export const viewport: Viewport = {
  themeColor: "#187A31",
}

export async function generateMetadata(): Promise<Metadata> {
  const merchant = await retrieveMerchantConfiguration()
  const theme = await retrieveMerchantTheme()
  const branding = theme?.configuration?.branding

  return {
    metadataBase: new URL(getBaseURL()),
    title: {
      default: branding?.name || merchant.name,
      template: "%s | " + (branding?.name || merchant.name),
    },
    description:
      branding?.description || "Shop " + merchant.name + " online",
  }
}

export default async function RootLayout(props: {
  children: React.ReactNode
}) {
  const theme = await retrieveMerchantTheme()
  const branding = theme?.configuration?.branding
  const themeStyle = {
    "--merchant-primary": branding?.primary_color || "#111827",
    "--merchant-accent": branding?.accent_color || "#2563eb",
  } as CSSProperties

  return (
    <html
      lang="en"
      data-mode="light"
      className={brandFont.variable}
      style={themeStyle}
    >
      <body>
        <main className="relative">{props.children}</main>
      </body>
    </html>
  )
}
