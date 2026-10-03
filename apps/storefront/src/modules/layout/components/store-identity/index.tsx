import Image from "next/image"

import { clx } from "@modules/common/components/ui"

type StoreIdentityProps = {
  name: string
  logoUrl?: string
  tone?: "light" | "dark"
  className?: string
}

/**
 * The merchant's mark: their logo when they have uploaded one, otherwise a
 * monogram, followed by the store name.
 */
const StoreIdentity = ({
  name,
  logoUrl,
  tone = "light",
  className,
}: StoreIdentityProps) => {
  const initial = name.trim().charAt(0).toUpperCase() || "S"

  return (
    <span className={clx("flex items-center gap-2.5 min-w-0", className)}>
      {logoUrl ? (
        <Image
          src={logoUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className={clx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold",
            tone === "light"
              ? "bg-brand-700 text-white"
              : "bg-white text-brand-900"
          )}
        >
          {initial}
        </span>
      )}
      <span
        className={clx(
          "truncate text-lg font-bold tracking-tight",
          tone === "light" ? "text-ink" : "text-white"
        )}
      >
        {name}
      </span>
    </span>
  )
}

export default StoreIdentity
