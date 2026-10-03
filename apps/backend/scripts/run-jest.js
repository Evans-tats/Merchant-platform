const { spawnSync } = require("node:child_process")

const supportedTestTypes = new Set([
  "integration:http",
  "integration:modules",
  "unit",
])
const testType = process.argv[2]

if (!supportedTestTypes.has(testType)) {
  console.error(
    `Expected a test type of: ${Array.from(supportedTestTypes).join(", ")}`
  )
  process.exit(1)
}

const vmModulesOption = "--experimental-vm-modules"
const existingNodeOptions = process.env.NODE_OPTIONS || ""
const nodeOptions = existingNodeOptions.includes(vmModulesOption)
  ? existingNodeOptions
  : `${existingNodeOptions} ${vmModulesOption}`.trim()
const jestBinary = require.resolve("jest/bin/jest")
const result = spawnSync(
  process.execPath,
  [jestBinary, ...process.argv.slice(3)],
  {
    env: {
      ...process.env,
      NODE_OPTIONS: nodeOptions,
      TEST_TYPE: testType,
    },
    stdio: "inherit",
  }
)

if (result.error) {
  console.error(result.error.message)
}

process.exit(result.status ?? 1)
