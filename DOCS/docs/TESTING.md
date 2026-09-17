# Testing

## Stack

- Vitest
- Fastify `inject()` for HTTP tests
- mocked external providers
- PostgreSQL/Prisma integration tests

## Unit coverage

### Profile
- GPA normalization;
- schema validation;
- exam validation;
- stable profile hash.

### Diagnosis
- strong academics;
- budget constraint;
- missing exam;
- target field.

### Recommendation
- filters;
- scoring boundaries;
- stable sort;
- budget reranking;
- target-field change;
- SAT effect;
- missing data;
- score 0–100 invariant;
- no admission-probability output.

### Roadmap
- deadline priority;
- dependencies;
- completed item skipped;
- exactly one next action;
- source metadata preserved.

### Providers
- malformed College Scorecard response;
- missing fields;
- timeout;
- malformed Gemini output;
- Gemini unavailable fallback.

## HTTP tests

At least:

- health;
- diagnosis valid/invalid;
- recommendations;
- no matches;
- comparison min/max;
- roadmap;
- plan persistence;
- status update;
- recalculation;
- safe upstream failure;
- no stack trace in error output.

## Database integration tests

Verify:

- Prisma migrations apply to a clean database;
- repository CRUD;
- profile/recommendation/roadmap persistence;
- status updates;
- unique/foreign-key constraints used by the domain.

Integration tests must run against a disposable/test database, not arbitrary development data.

## Docker checks

Before final self-hosting milestone:

```bash
docker compose -f compose.dev.yml config
docker compose -f deploy/compose.prod.yml config
docker build .
```

Production Compose validation may require an example env file.

## Final quality gates

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
```

Normal test suites must not require live Gemini or College Scorecard.
