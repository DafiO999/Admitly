# Codex roadmap

This roadmap assumes development starts on a normal PC and production deployment happens later on a self-hosted Linux server.

A request such as:

```text
Сделай milestone 4
```

must be sufficient.

For every milestone Codex follows `AGENTS.md`, implements only that milestone, verifies it, marks it complete, commits it, and stops.

---

# [x] Milestone 1 — Backend foundation

## Goal

Create the Fastify + TypeScript project and quality gates.

## Read before coding

- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/ENVIRONMENT.md`
- `docs/TESTING.md`

## Implement

- Node/TypeScript project;
- Fastify;
- TypeScript strict mode;
- Zod;
- Vitest;
- ESLint;
- environment validation;
- architecture folders;
- safe global error handler;
- `GET /api/health`;
- scripts:
  - `dev`
  - `build`
  - `start`
  - `lint`
  - `typecheck`
  - `test`
  - `test:integration`;
- `.env.example`;
- `.gitignore`;
- smoke tests.

Do not add a database yet.

## Acceptance

- server boots;
- health returns success;
- strict TypeScript enabled;
- error handler never exposes stack traces in normal API output;
- no real secret committed.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Set up the Fastify backend foundation
```

---

# [ ] Milestone 2 — Local PostgreSQL and Prisma foundation

## Goal

Make the project reproducibly runnable on a PC with PostgreSQL in Docker.

## Read before coding

- `docs/LOCAL_DEVELOPMENT.md`
- `docs/DOMAIN_AND_DATA.md`
- `docs/ENVIRONMENT.md`

## Implement

- Prisma dependencies/config;
- `prisma/schema.prisma`;
- initial migration infrastructure;
- `compose.dev.yml` with PostgreSQL only;
- pinned PostgreSQL major version;
- named development volume;
- database healthcheck;
- Prisma client infrastructure;
- database connectivity check;
- package scripts for Prisma operations where useful;
- integration test setup using a dedicated test DB/schema.

Do not add business tables beyond minimal migration scaffolding if domain milestone has not introduced them yet.

## Acceptance

These workflows are valid:

```bash
docker compose -f compose.dev.yml up -d db
npx prisma migrate dev
npm run dev
```

Prisma can connect to local PostgreSQL and integration-test configuration cannot accidentally wipe arbitrary developer data.

## Verify

```bash
docker compose -f compose.dev.yml config
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Run the DB connectivity/integration smoke test when Docker is available.

## Commit

```text
Add local PostgreSQL development setup
```

---

# [ ] Milestone 3 — Domain contracts, database schema and seed fixtures

## Goal

Define stable domain contracts and persistable schema.

## Read before coding

- `docs/DOMAIN_AND_DATA.md`
- `docs/PROJECT_SPEC.md`
- `docs/LOCAL_DEVELOPMENT.md`

## Implement

- domain types and Zod schemas;
- GPA normalization;
- source-status validation;
- version constants;
- stable profile hash;
- Prisma models for:
  - profiles;
  - universities;
  - admission requirements;
  - recommendation runs;
  - roadmaps;
  - roadmap items;
- Prisma migration;
- deterministic seed script;
- at least 8 demo universities;
- demo requirement records;
- tests.

Unverified requirements must be `demo`.

## Acceptance

- all fixtures validate;
- official/verified requirement without source URL is rejected;
- migrations apply cleanly;
- seed is deterministic/idempotent enough for development;
- fixture variance supports later budget/field/SAT tests;
- Prisma types do not leak into domain APIs.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
```

## Commit

```text
Add domain models, database schema and seed data
```

---

# [ ] Milestone 4 — Deterministic diagnosis API

## Goal

Implement profile diagnosis without any AI dependency.

## Read before coding

- `docs/PROJECT_SPEC.md`
- `docs/API_CONTRACTS.md`
- `docs/DOMAIN_AND_DATA.md`

## Implement

- diagnosis domain service;
- application service;
- `POST /api/diagnosis`;
- structured:
  - goal summary;
  - strengths;
  - constraints;
  - focus-now items;
- unit and HTTP tests.

No Gemini call.

## Acceptance

- works without network;
- every claim comes from profile/rules;
- invalid profile returns safe validation error;
- response matches API contract.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Add deterministic applicant diagnosis API
```

---

# [ ] Milestone 5 — College Scorecard provider

## Goal

Add live university-data adapter without coupling provider payloads to the domain.

## Read before coding

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_AND_DATA.md`
- `docs/ENVIRONMENT.md`

## Implement

- `UniversityProvider` port;
- `DemoUniversityProvider`;
- `CollegeScorecardProvider`;
- provider response schemas/mappers;
- timeout and typed errors;
- source/data-year mapping;
- config-based demo/live selection;
- mocked provider tests.

Normal tests must not make live network calls.

## Acceptance

- domain receives only normalized `University`;
- missing external fields are safe;
- demo mode works with no key/network;
- provider failure is typed;
- key is never logged.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Integrate College Scorecard university data
```

---

# [ ] Milestone 6 — Recommendation engine and API

## Goal

Implement deterministic, explainable ranking.

## Read before coding

- `docs/RECOMMENDATION_AND_AI.md`
- `docs/API_CONTRACTS.md`

## Implement

- hard filters;
- academic/program/budget/preference scorers;
- centralized weights;
- deterministic reason codes;
- concerns;
- stable tie-break;
- engine version;
- top 3–5;
- `POST /api/recommendations`;
- mandatory recommendation tests.

No Gemini dependency.

## Acceptance

- canonical fixture returns at least 3 recommendations;
- score is integer 0–100;
- identical input gives identical order;
- budget change affects relevant score/order;
- field change affects candidates/program fit;
- SAT change affects academic score when supported;
- no admission-probability field exists.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Add explainable university recommendation engine
```

---

# [ ] Milestone 7 — Comparison API

## Goal

Expose normalized comparison data for 2–3 institutions.

## Read before coding

- `docs/API_CONTRACTS.md`
- `docs/DOMAIN_AND_DATA.md`

## Implement

- comparison application service;
- `POST /api/comparison`;
- validate 2–3 IDs;
- reuse recommendation engine output;
- include requirements and source statuses;
- tests.

## Acceptance

- unknown remains unknown;
- verified deadline requires source metadata;
- no duplicate scoring implementation;
- invalid number of IDs is rejected.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Add university comparison API
```

---

# [ ] Milestone 8 — Gemini explanations

## Goal

Add guarded optional AI wording.

## Read before coding

- `docs/RECOMMENDATION_AND_AI.md`
- `docs/ENVIRONMENT.md`
- `docs/API_CONTRACTS.md`

## Implement

- `AiProvider`;
- Gemini adapter;
- structured output;
- Zod validation;
- prompt versions;
- timeout;
- bounded retry;
- diagnosis enhancement;
- recommendation explanation endpoint;
- deterministic fallback;
- mocked tests for valid/malformed/error cases.

## Acceptance

- Gemini cannot alter ranking;
- malformed model output is rejected safely;
- missing key does not break deterministic endpoints;
- AI cannot create verified deadlines/costs/probabilities.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Add Gemini-powered recommendation explanations
```

---

# [ ] Milestone 9 — Roadmap engine and next action

## Goal

Build deterministic, source-aware admission roadmap logic.

## Read before coding

- `docs/PROJECT_SPEC.md`
- `docs/DOMAIN_AND_DATA.md`
- `docs/RECOMMENDATION_AND_AI.md`
- `docs/API_CONTRACTS.md`

## Implement

- task builder;
- categories/status/dependencies;
- due-date logic;
- next-action selector;
- source coverage summary;
- `POST /api/roadmap`;
- optional Gemini rewrite without factual changes;
- tests.

## Acceptance

- roadmap works without Gemini;
- deadlines retain source metadata;
- completed/blocked items handled correctly;
- exactly one next action when actionable tasks exist;
- same input gives same deterministic task semantics.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Commit

```text
Add personalized admission roadmap generation
```

---

# [ ] Milestone 10 — PostgreSQL repositories and persistence API

## Goal

Persist profiles, recommendation runs and roadmaps in the local PostgreSQL schema that will later be used in production.

## Read before coding

- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_AND_DATA.md`
- `docs/API_CONTRACTS.md`
- `docs/LOCAL_DEVELOPMENT.md`

## Implement

- repository ports if not already present;
- Prisma repository implementations;
- profile persistence;
- recommendation-run persistence;
- roadmap persistence;
- roadmap-item status persistence;
- `PUT /api/profile`;
- `GET /api/plan/:profileId`;
- `PATCH /api/roadmaps/:roadmapId/items/:itemId`;
- repository tests against disposable/test DB.

Do not implement Supabase or a separate managed persistence path.

## Acceptance

- raw Prisma queries remain inside infrastructure;
- local PostgreSQL is the persistence source;
- foreign keys/constraints protect basic coherence;
- status update recalculates next action;
- repository integration tests pass against a clean migrated database.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
```

## Commit

```text
Persist admission plans in PostgreSQL
```

---

# [ ] Milestone 11 — Coherent plan recalculation

## Goal

Rebuild recommendation and roadmap state after profile changes.

## Read before coding

- `docs/PROJECT_SPEC.md`
- `docs/RECOMMENDATION_AND_AI.md`
- `docs/API_CONTRACTS.md`
- `docs/DOMAIN_AND_DATA.md`

## Implement

- `POST /api/plan/recalculate`;
- validate updated profile;
- recompute recommendation run;
- invalidate stale AI explanation output/cache;
- rebuild roadmap;
- persist a coherent new plan using a transaction where appropriate;
- preserve completed tasks only when task identity/semantics safely match;
- budget/field/SAT tests.

## Acceptance

- no stale explanation/score pairing;
- failed recalculation does not persist an obviously mixed plan;
- budget/field/SAT tests demonstrate expected changes;
- engine/prompt/rule versions propagate.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
```

## Commit

```text
Recalculate plans when applicant profile changes
```

---

# [ ] Milestone 12 — Backend hardening

## Goal

Make local/backend behavior robust before containerizing production.

## Read before coding

- `docs/ARCHITECTURE.md`
- `docs/ENVIRONMENT.md`
- `docs/TESTING.md`

## Implement

- consistent error mapping;
- request-size limits where appropriate;
- external-provider timeout handling;
- database unavailable mapping;
- no-match behavior;
- log sanitization;
- malformed provider/AI tests;
- malformed persistence-path tests;
- readiness strategy for deployment.

## Acceptance

- known failures do not leak stack traces/secrets;
- Gemini outage leaves deterministic endpoints usable;
- Scorecard outage can fall back to demo mode where configured;
- DB failure produces safe service error;
- local quality gates all pass.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
```

## Commit

```text
Improve backend error handling and resilience
```

---

# [ ] Milestone 13 — Production Docker image

## Goal

Package the already-working local backend for a Linux server without changing domain behavior.

## Read before coding

- `docs/SELF_HOSTING.md`
- `docs/ENVIRONMENT.md`
- `docs/ARCHITECTURE.md`

## Implement

- multi-stage `Dockerfile`;
- `.dockerignore`;
- production start command;
- Prisma Client generation in build;
- non-root runtime where practical;
- image-level/Compose-ready health behavior;
- verify production image can start against PostgreSQL;
- no development-only bind mounts.

## Acceptance

- `docker build .` succeeds;
- built image runs compiled application;
- no source secret copied into image;
- Prisma runtime works;
- image responds to `/api/health`.

## Verify

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
docker build .
```

Run container smoke test when Docker is available.

## Commit

```text
Add production Docker image for the backend
```

---

# [ ] Milestone 14 — Self-hosted production Compose

## Goal

Create reproducible server deployment topology: Caddy + backend + PostgreSQL.

## Read before coding

- `docs/SELF_HOSTING.md`
- `docs/ENVIRONMENT.md`
- `docs/TESTING.md`

## Implement

- `deploy/compose.prod.yml`;
- pinned PostgreSQL major;
- named PostgreSQL volume;
- internal Docker network;
- no public DB port;
- API internal-only behind Caddy;
- Caddy service exposing 80/443;
- `deploy/Caddyfile`;
- Caddy persistent volumes;
- healthchecks;
- restart policies;
- `deploy/env.production.example`;
- production Compose config validation.

Do not put real domain/server credentials into Git.

## Acceptance

- only Caddy requires public ports;
- DB and API communicate internally;
- PostgreSQL data persists across container recreation;
- production env contract is explicit;
- Compose parses successfully.

## Verify

```bash
docker compose -f deploy/compose.prod.yml --env-file deploy/env.production.example config
docker build .
npm run lint
npm run typecheck
npm test -- --run
```

## Commit

```text
Add self-hosted production Docker Compose stack
```

---

# [ ] Milestone 15 — Deployment, migrations and database backup tooling

## Goal

Prepare safe server-side operations without requiring manual code edits on the server.

## Read before coding

- `docs/SELF_HOSTING.md`
- `docs/LOCAL_DEVELOPMENT.md`
- `docs/ENVIRONMENT.md`

## Implement

- `deploy/scripts/deploy.sh`;
- production migration command using `prisma migrate deploy`;
- wait-for-database/readiness logic;
- final health verification;
- `deploy/scripts/backup-db.sh`;
- timestamped `pg_dump` backups;
- `deploy/scripts/restore-db.sh`;
- explicit restore safety guard;
- no volume deletion;
- useful non-zero exits;
- shell syntax validation where tools exist.

## Acceptance

Deployment script:

1. validates env;
2. builds images;
3. ensures DB is healthy;
4. applies production migrations;
5. starts/recreates services;
6. verifies API health.

Backup does not expose password and restore cannot run accidentally.

## Verify

```bash
bash -n deploy/scripts/deploy.sh
bash -n deploy/scripts/backup-db.sh
bash -n deploy/scripts/restore-db.sh
docker compose -f deploy/compose.prod.yml --env-file deploy/env.production.example config
```

Plus normal project quality gates.

## Commit

```text
Add deployment, migration and database backup scripts
```

---

# [ ] Milestone 16 — Final local-to-server validation

## Goal

Freeze a backend that is demonstrably reproducible both locally and on the production Compose topology.

## Read before coding

- all documentation;
- especially:
  - `docs/LOCAL_DEVELOPMENT.md`
  - `docs/SELF_HOSTING.md`
  - `docs/API_CONTRACTS.md`
  - `docs/TESTING.md`

## Implement

- reconcile code and docs;
- remove abandoned backend/deployment code;
- ensure `.env.example` is current;
- produce OpenAPI schema from route schemas or an equivalent generated API contract;
- add full flow integration test:

```text
profile
-> diagnosis
-> recommendations
-> comparison
-> roadmap
-> persistence
-> recalculate
```

- validate development Compose;
- validate production Compose;
- test clean local DB migration + seed;
- test production image build;
- keep README backend/self-hosting only.

Do not deploy to a real server unless the environment already provides authorized server access.

## Acceptance

- documented API matches code;
- local clean setup is reproducible;
- migrations work on a clean database;
- production image builds;
- production Compose validates;
- full backend flow passes in demo mode without live APIs;
- no Vercel/Supabase/frontend dependency remains.

## Verify

```bash
docker compose -f compose.dev.yml config
docker compose -f deploy/compose.prod.yml --env-file deploy/env.production.example config
npm run lint
npm run typecheck
npm test -- --run
npm run build
npm run test:integration
docker build .
git status --short
```

## Commit

```text
Finalize local-to-server deployment workflow
```

---

## Dependency order

```text
1  backend foundation
2  local PostgreSQL + Prisma
3  domain/schema/seed
4  diagnosis
5  Scorecard
6  recommendations
7  comparison
8  Gemini
9  roadmap
10 PostgreSQL persistence
11 recalculation
12 hardening
13 production Docker image
14 production Compose
15 deployment + backup tooling
16 final local-to-server validation
```
