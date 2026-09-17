# Local development contract

This file defines how Codex must make the project runnable on a developer PC.

## Primary workflow

Run PostgreSQL in Docker and run the Fastify process directly on the host.

```text
PC
├─ npm run dev            -> Fastify hot reload
└─ Docker
   └─ PostgreSQL
```

This minimizes rebuild time while keeping the database reproducible.

## Required files

```text
compose.dev.yml
.env.example
prisma/schema.prisma
prisma/migrations/
prisma/seed.ts
```

## Development PostgreSQL

`compose.dev.yml` should define only what local backend development requires.

Example target shape:

```yaml
services:
  db:
    image: postgres:<pinned-major-version>
    environment:
      POSTGRES_DB: admitly
      POSTGRES_USER: admitly
      POSTGRES_PASSWORD: admitly
    ports:
      - "5432:5432"
    volumes:
      - admitly_dev_pgdata:/var/lib/postgresql/data
    healthcheck:
      ...
```

Pin a PostgreSQL major version rather than using `latest`.

Development credentials may be predictable because they are local-only and explicitly non-production.

## Canonical local commands

After milestone implementation, the intended flow is:

```bash
docker compose -f compose.dev.yml up -d db
npm install
npx prisma migrate dev
npx prisma db seed
npm run dev
```

Verification:

```bash
curl http://localhost:3001/api/health
```

## Resetting local database

Provide a documented safe reset command for development only.

Typical approach:

```bash
docker compose -f compose.dev.yml down -v
docker compose -f compose.dev.yml up -d db
npx prisma migrate dev
npx prisma db seed
```

This must never be reused as a production reset procedure.

## Prisma generation

Ensure dependency installation/build generates Prisma Client where required.

One of the package scripts may include:

```text
prisma generate
```

Do not make local success depend on manually generated uncommitted artifacts.

## Demo data

Seeding must provide deterministic data sufficient for:

- >= 3 recommendations;
- budget-based reranking;
- field changes;
- SAT-based academic changes where supported;
- roadmap generation.

## Local integration tests

A database-backed integration test command may:

1. require local development PostgreSQL;
2. apply migrations;
3. run repository tests;
4. clean only test-owned data.

It must not destroy an arbitrary developer database.
