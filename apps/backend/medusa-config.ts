import { defineConfig, loadEnv } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  admin: {
    vite: (config) => ({
      resolve: {
        dedupe: [
          ...new Set([...(config.resolve?.dedupe ?? []), "react", "react-dom"]),
        ],
      },
    }),
  },
  featureFlags: {
    rbac: true,
  },
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    },
  },
  modules: [
    {
      resolve: "./src/modules/merchant",
    },
    {
      resolve: "./src/modules/mpesa-registry",
    },
    {
      resolve: "./src/modules/mpesa-onboarding",
    },
    {
      resolve: "./src/modules/agent",
    },
  ],
})
