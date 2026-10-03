"use client"

import {
  addMerchantDomain,
  type AddMerchantDomainState,
} from "@lib/data/merchant-admin"
import { useActionState } from "react"

const initialState: AddMerchantDomainState = {
  error: null,
  verificationToken: null,
  hostname: null,
}

export default function MerchantDomainForm({
  countryCode,
}: {
  countryCode: string
}) {
  const [state, formAction] = useActionState(
    addMerchantDomain.bind(null, countryCode),
    initialState
  )

  return (
    <div className="mb-4">
      <form action={formAction} className="flex gap-3">
        <input
          className="w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-sm"
          name="hostname"
          placeholder="shop.example.com"
          required
        />
        <button
          className="rounded-md bg-ui-button-inverted px-4 py-2 text-sm text-ui-fg-on-inverted"
          type="submit"
        >
          Add
        </button>
      </form>
      {state.error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.verificationToken && state.hostname && (
        <div className="mt-3 rounded-md bg-ui-bg-subtle p-3 text-sm">
          <p className="font-medium">
            Add this DNS TXT record, then click Verify:
          </p>
          <p className="mt-2 break-all font-mono text-xs">
            _merchant-verification.{state.hostname} TXT{" "}
            {state.verificationToken}
          </p>
          <p className="mt-2 text-xs text-ui-fg-subtle">
            This challenge is shown once. Only its SHA-256 hash is stored.
          </p>
        </div>
      )}
    </div>
  )
}
