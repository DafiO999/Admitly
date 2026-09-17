# Self-hosted production deployment contract

The target is a normal Linux server controlled by the project owner.

Codex must prepare the repository so deployment is reproducible after local development is complete.

## Production topology

```text
Internet
   |
  80/443
   |
 Caddy
   |
 internal Docker network
   |
 Admitly backend :3001
   |
 internal Docker network
   |
 PostgreSQL :5432
   |
 named persistent volume
```

## Required production artifacts

```text
Dockerfile
.dockerignore

deploy/
  compose.prod.yml
  Caddyfile
  env.production.example
  scripts/
    deploy.sh
    backup-db.sh
    restore-db.sh
```

Do not commit the real production `.env.production`.

## Backend Dockerfile

Requirements:

- multi-stage build;
- pinned/controlled Node major version;
- production dependencies only in final image where practical;
- Prisma Client generated during build;
- compiled TypeScript runs without dev tooling;
- non-root user where practical;
- expose only internal application port;
- healthcheck may be defined in Compose if simpler.

## Production Compose

`deploy/compose.prod.yml` contains:

### `db`
- pinned PostgreSQL major version;
- no public `ports` mapping;
- named volume;
- healthcheck;
- restart policy.

### `api`
- built from repository Dockerfile;
- receives production env;
- depends on healthy DB;
- no public port required if Caddy is in the same Compose network;
- restart policy;
- application healthcheck.

### `caddy`
- only service publishing 80/443;
- reverse proxies to `api:3001`;
- persistent Caddy data/config volumes;
- restart policy.

## Caddy

Production `Caddyfile` should be parameterizable by domain through an environment value or generated deployment config.

Reverse proxy target:

```text
api:3001
```

No PostgreSQL exposure.

## Migrations

Production schema changes use:

```bash
npx prisma migrate deploy
```

Deployment must include an explicit migration step before/while starting the new backend.

Never use:

```bash
prisma migrate dev
prisma db push
```

as production migration commands.

## Deployment script

`deploy/scripts/deploy.sh` should be non-destructive and roughly perform:

1. validate required production env exists;
2. pull/build target revision as appropriate for repository deployment strategy;
3. build images;
4. start database if necessary;
5. wait for database health;
6. run `prisma migrate deploy` in an application image/container;
7. start/recreate API and Caddy;
8. wait for `/api/health`;
9. fail with non-zero status if health never becomes ready;
10. print final service status.

Do not silently wipe volumes.

## Backups

Provide PostgreSQL backup script using `pg_dump`.

Requirements:

- timestamped backup;
- configurable output directory;
- failure exits non-zero;
- does not print database password;
- backup directory is outside the database container's ephemeral filesystem.

Example logical artifact:

```text
backups/admitly_YYYY-MM-DD_HH-MM-SS.dump
```

## Restore

Provide a restore script or documented command.

Safety:

- restore requires explicit backup path;
- print target database identity excluding password;
- require an explicit confirmation flag or environment guard;
- never auto-restore during normal deployment.

## Persistence

Database data lives in a named Docker volume.

Caddy certificate/state volumes also persist.

Container recreation must not remove PostgreSQL data.

## Network exposure

Expected externally reachable ports:

```text
80/tcp
443/tcp
```

Do not publish:

```text
5432
3001
```

unless a later deployment architecture explicitly requires it.

## Health

At minimum:

```text
GET /api/health
```

Production readiness should detect database connectivity as part of deployment verification, either through:

- a dedicated readiness endpoint; or
- an explicit DB check in deployment script.

Do not leak database host/password in health output.

## Logs

Use container stdout/stderr.

Do not log:

- full `DATABASE_URL`;
- DB password;
- Gemini key;
- College Scorecard key.

## Upgrade path

Production updates should be reproducible:

```text
new Git revision
  -> image rebuild
  -> migration deploy
  -> service recreate
  -> health verification
```

No manual code editing on the server is part of the canonical deployment process.

## Rollback

At minimum, document:

- previous Git revision/image;
- database migrations may be forward-only;
- code rollback is safe only if the previous application version is compatible with the migrated schema.

Do not automatically run destructive database rollbacks.
