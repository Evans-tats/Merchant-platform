# Backend Tests

The backend test command runs unit, module integration, and HTTP integration
suites:

```bash
npm test
```

For local runs, each integration suite starts a PostgreSQL 15 container on port
`5433`, waits for it to become healthy, and removes it after the suite. Medusa's
integration runners create uniquely named databases and remove their test data
during cleanup.

Set `TEST_POSTGRES_PORT` before running the tests if port `5433` is unavailable.

## CI

When CI already provides a disposable PostgreSQL service, configure `DB_HOST`, `DB_PORT`, `DB_USERNAME`, and `DB_PASSWORD`, then run:

```bash
npm run test:ci
```

Remote database hosts are rejected by default. `ALLOW_REMOTE_TEST_DATABASE=true` may be used only when the target is an explicitly disposable CI database that permits database creation and deletion.

## Individual Suites

```bash
npm run test:unit
npm run test:integration:http
npm run test:integration:modules
npm run test:integration:modules:local
```

Direct integration-suite commands expect PostgreSQL to already be running. The following helpers manage the local test service manually:

```bash
npm run test:db:up
npm run test:db:down
```

Jest is configured to fail when a selected suite contains no tests.

The Merchant A and Merchant B factories live in `integration-tests/helpers/merchant-fixtures.ts`. They intentionally use one shared shopper email while keeping merchant domains, owners, and catalog data distinct.
