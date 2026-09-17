# Admitly Backend

Backend/domain service for the LOCUS admission-journey project.

The repository is designed for this lifecycle:

```text
Local development on a PC
        ↓
Dockerized PostgreSQL
        ↓
Fastify backend developed/tested locally
        ↓
Production Docker image
        ↓
Self-hosted Linux server
        ↓
Docker Compose: Caddy + backend + PostgreSQL
```

No Vercel or Supabase is required.

## Stack

- Node.js
- TypeScript
- Fastify
- Zod
- PostgreSQL
- Prisma ORM
- Gemini API
- College Scorecard / api.data.gov
- Docker
- Docker Compose
- Caddy
- Vitest

## Functional scope

- applicant profile validation;
- deterministic diagnosis;
- university-provider abstraction;
- College Scorecard integration;
- deterministic recommendation engine;
- comparison API;
- guarded Gemini explanations;
- source-aware admission roadmap;
- next-action calculation;
- PostgreSQL persistence;
- coherent recalculation after profile edits;
- production self-hosting artifacts.

## Documentation

- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DOMAIN_AND_DATA.md`
- `docs/RECOMMENDATION_AND_AI.md`
- `docs/API_CONTRACTS.md`
- `docs/ENVIRONMENT.md`
- `docs/LOCAL_DEVELOPMENT.md`
- `docs/SELF_HOSTING.md`
- `docs/TESTING.md`
- `docs/CODEX_ROADMAP.md`

## Codex execution

`docs/CODEX_ROADMAP.md` is the canonical development plan.

Example:

```text
Сделай milestone 6
```

Codex must implement only milestone 6, verify it, commit it, and stop.
