import {
  retrieveMerchantConfiguration,
  retrieveMerchantTheme,
} from "@lib/data/merchant"
import { ArrowRight, Phone } from "@medusajs/icons"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const paySteps = [
  "Add what you like to your cart",
  "Enter your M-PESA number at checkout",
  "Approve the prompt on your phone",
]

const Hero = async () => {
  const [merchant, theme] = await Promise.all([
    retrieveMerchantConfiguration(),
    retrieveMerchantTheme(),
  ])
  const branding = theme?.configuration?.branding
  const storeName = branding?.name || merchant.name

  return (
    <section
      aria-labelledby="hero-title"
      className="content-container pt-4 small:pt-6"
    >
      <div className="relative isolate overflow-hidden rounded-3xl bg-brand-900 text-white">
        {/* Soft rings echo the Safaricom wave without needing an image. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <div className="absolute -right-24 -top-40 h-[440px] w-[440px] rounded-full bg-brand-600/50 blur-3xl" />
          <div className="absolute -bottom-48 -left-24 h-[380px] w-[380px] rounded-full border-[48px] border-brand-500/15" />
          <div className="absolute -bottom-32 right-[18%] h-[260px] w-[260px] rounded-full border-[28px] border-brand-400/20" />
        </div>

        <div className="grid gap-8 px-6 py-10 small:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] small:items-center small:px-12 small:py-16">
          <div className="flex flex-col items-start gap-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand-100 ring-1 ring-white/15">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-brand-400"
              />
              Lipa na M-PESA
            </span>
            <h1
              id="hero-title"
              className="text-4xl font-extrabold leading-[1.05] tracking-tight text-balance small:text-6xl"
            >
              {storeName}
            </h1>
            <p className="max-w-lg text-base text-brand-100 small:text-lg">
              {branding?.description ||
                "Shop " + storeName + " online and pay with M-PESA."}
            </p>
            <LocalizedClientLink
              href="/store"
              className="mt-1 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-brand-900 transition-colors hover:bg-brand-50"
            >
              Shop now
              <ArrowRight aria-hidden="true" />
            </LocalizedClientLink>
          </div>

          <div className="hidden rounded-2xl bg-white p-6 text-ink shadow-2xl small:block">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white"
              >
                <Phone />
              </span>
              <div>
                <p className="font-bold">Pay with M-PESA</p>
                <p className="text-sm text-ink-muted">
                  No card or account needed
                </p>
              </div>
            </div>
            <ol className="mt-5 flex flex-col gap-3">
              {paySteps.map((step, index) => (
                <li key={step} className="flex items-center gap-3 text-sm">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800"
                  >
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Hero
