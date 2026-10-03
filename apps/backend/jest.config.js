const { loadEnv, MedusaError } = require("@medusajs/utils")

loadEnv("test", process.cwd())

const testMatches = {
  "integration:http": ["**/integration-tests/http/*.spec.[jt]s"],
  "integration:modules": ["**/src/modules/*/__tests__/**/*.[jt]s"],
  unit: ["**/src/**/__tests__/**/*.unit.spec.[jt]s"],
}

const testType = process.env.TEST_TYPE

if (!testType || !testMatches[testType]) {
  throw new MedusaError(
    MedusaError.Types.INVALID_DATA,
    `TEST_TYPE must be one of: ${Object.keys(testMatches).join(", ")}`
  )
}

const isIntegrationTest = testType.startsWith("integration:")

if (isIntegrationTest) {
  process.env.DB_HOST ??= "localhost"
  process.env.DB_PORT ??= "5433"
  process.env.DB_USERNAME ??= "postgres"
  process.env.DB_PASSWORD ??= "postgres"

  const safeDatabaseHosts = new Set([
    "127.0.0.1",
    "::1",
    "localhost",
    "postgres",
    "test-postgres",
  ])

  if (
    !safeDatabaseHosts.has(process.env.DB_HOST) &&
    process.env.ALLOW_REMOTE_TEST_DATABASE !== "true"
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Integration tests may only create databases on a local disposable PostgreSQL instance. " +
        "Set ALLOW_REMOTE_TEST_DATABASE=true only for an explicitly disposable CI database."
    )
  }
}

module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
        },
      },
    ],
  },
  testEnvironment: "node",
  testMatch: testMatches[testType],
  testTimeout: isIntegrationTest ? 180000 : 10000,
  passWithNoTests: false,
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["dist/", "<rootDir>/.medusa/"],
  setupFiles: ["./integration-tests/setup.js"],
}
