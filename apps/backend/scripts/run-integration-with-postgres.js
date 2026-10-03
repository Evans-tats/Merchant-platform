const { spawnSync } = require("node:child_process")
const path = require("node:path")

const supportedTestTypes = new Set(["integration:http", "integration:modules"])
const testType = process.argv[2]

if (!supportedTestTypes.has(testType)) {
  console.error(
    `Expected an integration test type of: ${Array.from(
      supportedTestTypes
    ).join(", ")}`
  )
  process.exit(1)
}

const composeFile = path.resolve(__dirname, "../../../docker-compose.test.yml")
const composeProject = "merchant-platform-tests"
const postgresPort = process.env.TEST_POSTGRES_PORT || "5433"
const composeArguments = [
  "compose",
  "-p",
  composeProject,
  "-f",
  composeFile,
]
const composeEnvironment = {
  ...process.env,
  TEST_POSTGRES_PORT: postgresPort,
}

function run(command, args, env = process.env) {
  return spawnSync(command, args, {
    env,
    stdio: "inherit",
  })
}

function stopDatabase() {
  return run(
    "docker",
    [...composeArguments, "down", "--volumes", "--remove-orphans"],
    composeEnvironment
  )
}

function main() {
  const startResult = run(
    "docker",
    [...composeArguments, "up", "-d", "--wait", "test-postgres"],
    composeEnvironment
  )

  if (startResult.error) {
    console.error(startResult.error.message)
    return 1
  }

  if (startResult.status !== 0) {
    stopDatabase()
    return startResult.status ?? 1
  }

  let exitCode = 1

  try {
    const testResult = run(
      process.execPath,
      [path.resolve(__dirname, "run-jest.js"), testType, ...process.argv.slice(3)],
      {
        ...process.env,
        ALLOW_REMOTE_TEST_DATABASE: "false",
        DB_HOST: "localhost",
        DB_PASSWORD: "postgres",
        DB_PORT: postgresPort,
        DB_USERNAME: "postgres",
      }
    )

    if (testResult.error) {
      console.error(testResult.error.message)
    }

    exitCode = testResult.status ?? 1
  } finally {
    const stopResult = stopDatabase()

    if (exitCode === 0 && stopResult.status !== 0) {
      exitCode = stopResult.status ?? 1
    }
  }

  return exitCode
}

process.exit(main())
