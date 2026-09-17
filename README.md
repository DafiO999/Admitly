# Admitly backend

Fastify and TypeScript service for the admission journey project. Milestone 1
provides the HTTP foundation and a health endpoint; database and business APIs
arrive in later milestones.

## Local run

Requires Node.js 20 or newer. Install dependencies with `pnpm install`, copy
`.env.example` to `.env`, then run `pnpm dev`. The default server listens on
`127.0.0.1:3001`; `GET /api/health` returns `{"status":"ok"}`.

The same package scripts work with npm (`npm run dev`, `npm run build`, etc.).
Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and
`pnpm test:integration` to check the foundation. `pnpm start` runs compiled
JavaScript after a build.
