# Environment contract

Configuration is validated in one module at process startup.

## Common variables

```text
NODE_ENV
HOST
PORT
DEMO_DATA_MODE
DATABASE_URL
GEMINI_API_KEY
GEMINI_MODEL
COLLEGE_SCORECARD_API_KEY
```

## Local development

Typical:

```env
NODE_ENV=development
HOST=127.0.0.1
PORT=3001
DEMO_DATA_MODE=true
DATABASE_URL=postgresql://admitly:admitly@localhost:5432/admitly?schema=public
```

Secrets for live Gemini/Scorecard can remain empty while deterministic milestones are being built.

## Production

Production uses a server-side untracked environment file, for example:

```text
deploy/.env.production
```

This file must be ignored by Git.

Production values include:

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=3001
DEMO_DATA_MODE=false
DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
GEMINI_MODEL=...
COLLEGE_SCORECARD_API_KEY=...
```

PostgreSQL container configuration may also use:

```text
POSTGRES_DB
POSTGRES_USER
POSTGRES_PASSWORD
```

The application should consume `DATABASE_URL`; Compose may construct it from server-side values if desired.

## Rules

- `.env.example` contains no real secret;
- `.env`, `.env.local`, `deploy/.env.production` and equivalent are gitignored;
- normal tests explicitly set/mock configuration;
- missing optional AI/provider keys must not crash unrelated deterministic endpoints;
- production startup must fail clearly if mandatory database configuration is invalid;
- never log `DATABASE_URL` or API keys.
