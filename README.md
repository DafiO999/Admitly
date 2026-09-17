# Admitly backend

Fastify and TypeScript service for the admission journey project. PostgreSQL,
Prisma, domain contracts, and deterministic demo data are available for local
development. `POST /api/diagnosis` returns a rules-based profile diagnosis.
`POST /api/recommendations` returns ranked universities and score components.
Its fit score describes profile match, not admission probability.
`POST /api/comparison` compares two or three selected universities with the
same fit scores and source-tagged requirements.
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

## Local run

Requires Node.js 20 or newer and Docker with Compose. Run:

```text
pnpm install
docker compose -f compose.dev.yml up -d db
```

Copy `.env.example` to `.env`, then run `pnpm db:migrate`, `pnpm db:seed`,
`pnpm db:check`, and `pnpm dev`. The backend runs on the host, while Docker
runs PostgreSQL. The default server listens on `127.0.0.1:3001`;
`GET /api/health` returns `{"status":"ok"}`. Dependency installation generates Prisma Client; run
`pnpm db:generate` after schema edits.

The seed contains fictional universities and requirements marked `demo`.
The university provider uses those fixtures when `DEMO_DATA_MODE=true`. With
`DEMO_DATA_MODE=false`, it uses College Scorecard and needs
`COLLEGE_SCORECARD_API_KEY`; no public provider endpoint is exposed yet.

The same package scripts work with npm (`npm run dev`, `npm run build`, etc.).
Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` for normal
checks. `pnpm start` runs compiled JavaScript after a build.

`TEST_DATABASE_URL` in `.env.example` uses the dedicated `admitly_test` schema.
Apply migrations to that schema before `pnpm test:integration`, for example by
temporarily setting `DATABASE_URL` to the `TEST_DATABASE_URL` value and running
`pnpm exec prisma migrate deploy`. The integration test accepts only a local
`admitly` database and the `admitly_test` schema; it never resets a database.
