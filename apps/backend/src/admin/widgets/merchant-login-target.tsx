import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router-dom"

import "../components/merchant/merchant-workspace.css"

type LoginLocationState = {
  from?: {
    pathname?: string
  }
}

const MerchantLoginTarget = () => {
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    const state = location.state as LoginLocationState | null

    if (!state?.from?.pathname) {
      navigate("/login", {
        replace: true,
        state: { from: { pathname: "/merchant" } },
      })
    }
  }, [location.state, navigate])

  return null
}

export const config = defineWidgetConfig({
  zone: "login.before",
  id: "merchant:login-target",
})

export default MerchantLoginTarget
