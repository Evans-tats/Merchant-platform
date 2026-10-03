import { Phone, TruckFast, User } from "@medusajs/icons"

const items = [
  {
    icon: Phone,
    title: "Pay with M-PESA",
    body: "Approve the payment on your phone",
  },
  {
    icon: User,
    title: "No account needed",
    body: "Check out as a guest in minutes",
  },
  {
    icon: TruckFast,
    title: "Delivery options",
    body: "Choose how to get your order at checkout",
  },
]

const TrustStrip = () => {
  return (
    <section aria-label="Why shop here" className="bg-sand">
      <ul className="content-container grid gap-3 py-6 small:grid-cols-3 small:gap-6 small:py-8">
        {items.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-brand-700 shadow-card"
            >
              <Icon />
            </span>
            <div className="text-sm">
              <p className="font-bold text-ink">{title}</p>
              <p className="text-ink-muted">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default TrustStrip
