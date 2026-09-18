# Admitly

Admitly combines a Russian Next.js frontend in [`frontend/`](frontend/) with a
Fastify API and PostgreSQL. The application supports US bachelor programs.

## Local development

Requires Node.js 20 or newer, pnpm, and Docker with Compose. In the repository
root, prepare the database and install dependencies:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
pnpm install
npm ci --prefix frontend
docker compose -f compose.dev.yml up -d db
pnpm db:migrate
pnpm db:check
```

Set `DEMO_DATA_MODE=false` and `COLLEGE_SCORECARD_API_KEY` in the ignored `.env`
to use live US university data. For offline fixture data, use
`DEMO_DATA_MODE=true` and optionally run `pnpm db:seed`. If port 5432 is in use,
set `ADMITLY_DEV_DB_PORT` and update both database URLs in `.env`.

Start the API and frontend in separate terminals:

```powershell
# Terminal 1, repository root
pnpm dev
```

```powershell
# Terminal 2, repository root
cd frontend
npm run dev
```

Open `http://localhost:3000`. Next.js forwards `/api/*` to the API at
`http://127.0.0.1:3001`; set `API_ORIGIN` for another backend address. Profile
and task progress live in PostgreSQL. Browser storage keeps only the profile
ID and theme. University photos reuse Atlas's decorative images; live facts and
public source links come from College Scorecard.
The backend filters Scorecard by matching bachelor programs before ranking up to
30 universities. Preferred states add another candidate pool. Recommendations
are saved with the plan; the frontend refreshes older snapshots after an engine
update, and **Обновить подбор** on the university page requests current data.

## Backend API

Fastify and TypeScript service for the admission journey project. PostgreSQL,
Prisma, domain contracts, and deterministic demo data are available for local
development. `POST /api/diagnosis` returns a rules-based profile diagnosis.
`POST /api/recommendations` returns ranked universities and score components.
Its fit score describes profile match, not admission probability.
`POST /api/comparison` compares two or three selected universities with the
same fit scores and source-tagged requirements.
`GET /api/universities/:universityId/admissions-contact` returns an active
official or verified admissions contact, or `404 UNIVERSITY_EMAIL_UNAVAILABLE`.
Contacts are stored in PostgreSQL with an HTTPS source URL and verification
timestamp. The demo seed contains no admissions addresses because its schools
are fictional; only independently verified real contacts should be curated
through the backend repository. The API does not accept a recipient override.
Set `GEMINI_API_KEY` to enable optional Gemini wording. Pass
`enhanceWithAi: true` to `POST /api/diagnosis`, or call
`POST /api/recommendations/:universityId/explanation` with a profile. Both
paths fall back to deterministic wording when Gemini is unavailable; ranking
and fit scores remain rule-based.
`POST /api/roadmap` builds preparation and application tasks for 1–3 selected
universities. It copies known application dates with their source metadata,
reports source coverage, and marks one available next action. An optional
`enhanceWithAi: true` rewrites generic task wording; the task facts stay
deterministic.
`PUT /api/profile` saves a profile and its initial recommendation and roadmap
snapshots in PostgreSQL. `GET /api/plan/:profileId` reads the current plan, and
`PATCH /api/roadmaps/:roadmapId/items/:itemId` updates a task status and next
action. `POST /api/plan/recalculate` accepts an updated profile with its ID,
recomputes the current plan, and carries forward completed tasks only when
their meaning and prerequisites still match. These persistence routes require
`DATABASE_URL`.

The generated OpenAPI 3.1 contract is in [`openapi/openapi.json`](openapi/openapi.json).
Run `pnpm api:generate` after changing a route or its Zod request schema. The
unit suite checks that the committed contract matches the generator and the
registered routes. Runtime Zod validation also enforces cross-field rules
that JSON Schema cannot express, such as a taken exam requiring a score.

The backend runs on the host, while Docker runs PostgreSQL. The default server
listens on `127.0.0.1:3001`;
`GET /api/health` is a liveness check; `GET /api/ready` verifies the PostgreSQL
plan tables before returning `{"status":"ready"}`. JSON request bodies are
limited to 128 KiB. Dependency installation generates Prisma Client; run
`pnpm db:generate` after schema edits.

The seed contains fictional universities and requirements marked `demo`.
The university provider uses those fixtures when `DEMO_DATA_MODE=true`.

The same package scripts work with npm (`npm run dev`, `npm run build`, etc.).
Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` for backend
checks. Run `npm run typecheck` and `npm run build` in `frontend/` for frontend
checks. `pnpm start` runs compiled backend JavaScript after a build.

## Production image

`docker build .` creates the Linux backend image with a Node 22 build stage,
generated Prisma Client, and a non-root runtime containing production
dependencies and compiled JavaScript. It starts `dist/server.js` on port 3001.
Pass `DATABASE_URL` and other production settings at container runtime; local
environment files are excluded from the build context. The image healthcheck
uses `/api/health`, while `/api/ready` checks database availability. The
runtime image includes the Prisma CLI and migrations for an explicit
`npx --no-install prisma migrate deploy` deployment step.

## Production operations

`deploy/compose.prod.yml` connects PostgreSQL, the API, and the frontend, and
publishes only Caddy's HTTP and HTTPS ports. PostgreSQL and Caddy state use
named volumes. Copy `deploy/env.production.example` to the ignored
`deploy/.env.production` and replace the placeholders. On a Linux server with
Docker Compose, run `bash deploy/scripts/deploy.sh` from the repository root. It
validates Compose configuration, builds both app images, waits for PostgreSQL,
runs `prisma migrate deploy`, recreates the API, frontend, and Caddy, and checks health and
database readiness. It does not remove named volumes. Caddy routes `/api/*` to
the API and all other paths to the frontend.

Run `bash deploy/scripts/backup-db.sh` to save a timestamped PostgreSQL custom
dump under the ignored `backups/` directory. Set `BACKUP_DIR` to choose another
host directory. Copy backups off the server as part of your backup policy.
To restore, stop the application services, then name both the dump and target
database explicitly:

```bash
docker compose -p admitly -f deploy/compose.prod.yml --env-file deploy/.env.production stop api web caddy
bash deploy/scripts/restore-db.sh backups/admitly_YYYY-MM-DD_HH-MM-SS.dump --confirm-db=admitly
bash deploy/scripts/deploy.sh
```

Restore replaces objects contained in the dump. Keep a pre-restore backup and
verify that the previous application revision is compatible with any newer
database migrations before rolling back code. Set `ADMITLY_ENV_FILE` and
`ADMITLY_PROJECT` to target a different environment or Compose project.

`TEST_DATABASE_URL` in `.env.example` uses the dedicated `admitly_test` schema.
Apply migrations to that schema before `pnpm test:integration`, for example by
temporarily setting `DATABASE_URL` to the `TEST_DATABASE_URL` value and running
`pnpm exec prisma migrate deploy`. Restore `DATABASE_URL` to the public-schema
URL before running tests; the integration guard requires the two URLs to differ.
The integration suite accepts only a local `admitly` database and the
`admitly_test` schema, runs files serially, and never resets a database.
