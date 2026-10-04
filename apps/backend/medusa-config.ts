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
    {
      // Uploads are written to <cwd>/static and served at /static. In
      // production that folder is a persistent volume, and backend_url must be
      // the public backend URL or product images point at localhost.
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-local",
            id: "local",
            options: {
              backend_url: `${
                process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"
              }/static`,
            },
          },
        ],
      },
    },
  ],
})
