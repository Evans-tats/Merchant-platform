import { Phone } from "@medusajs/icons"

import { clx } from "@modules/common/components/ui"

/**
 * Tells the shopper how payment works before they reach checkout, so the
 * M-PESA prompt on their phone is expected rather than a surprise.
 */
const MpesaPayNote = ({ className }: { className?: string }) => {
  return (
    <div
      className={clx(
        "flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-4",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-700 text-white"
      >
        <Phone />
      </span>
      <div className="text-sm">
        <p className="font-bold text-brand-900">Pay with M-PESA</p>
        <p className="text-ink-muted">
          At checkout you&apos;ll get a payment prompt on your phone. Enter your
          PIN to confirm. No card needed.
        </p>
      </div>
    </div>
  )
}

export default MpesaPayNote
