# Architecture

## High-level

```text
                  +----------------------+
                  |   External client    |
                  +----------+-----------+
                             |
                             v
                      Fastify HTTP API
                             |
                             v
                    Application services
                             |
                             v
                         Domain
               +-------------+-------------+
               |             |             |
             Profile    Recommendation   Roadmap
               |             |             |
               +-------------+-------------+
                             |
              +--------------+----------------+
              |                               |
              v                               v
       Repository ports                 Provider ports
              |                       +---------------+
              v                       |               |
      Prisma/PostgreSQL               v               v
                              College Scorecard     Gemini
```

## Dependency direction

Domain code must not import:

- Fastify;
- Prisma Client;
- Gemini SDK;
- Docker libraries;
- provider-specific College Scorecard response types.

Infrastructure implements ports owned by application/domain layers.

## Suggested repository structure

```text
src/
  server.ts
  app.ts

  config/
    env.ts

  domain/
    profile/
    diagnosis/
    university/
    recommendation/
    roadmap/

  application/
    services/
    ports/

  infrastructure/
    db/
      prisma/
      repositories/
    college-scorecard/
    gemini/
    demo/

  http/
    routes/
    schemas/
    errors/

  shared/

prisma/
  schema.prisma
  migrations/
  seed.ts

tests/
  unit/
  http/
  integration/

deploy/
  Caddyfile
  compose.prod.yml
  env.production.example
  scripts/
    deploy.sh
    backup-db.sh
    restore-db.sh

compose.dev.yml
Dockerfile
.dockerignore
```

## Ports

### UniversityProvider

```ts
interface UniversityProvider {
  search(input: UniversitySearchInput): Promise<University[]>;
  getById(id: string): Promise<University | null>;
}
```

Implementations:

- `DemoUniversityProvider`
- `CollegeScorecardProvider`

### AiProvider

```ts
interface AiProvider {
  createDiagnosisExplanation(input: DiagnosisAiInput): Promise<DiagnosisAiOutput>;
  explainRecommendation(input: RecommendationAiInput): Promise<RecommendationAiOutput>;
  rewriteRoadmap(input: RoadmapAiInput): Promise<RoadmapAiOutput>;
}
```

### Repositories

Examples:

```ts
interface ProfileRepository {
  findById(id: string): Promise<StudentProfile | null>;
  save(profile: StudentProfile): Promise<StudentProfile>;
}

interface PlanRepository {
  getCurrent(profileId: string): Promise<AdmissionPlan | null>;
  save(plan: AdmissionPlan): Promise<AdmissionPlan>;
}
```

Prisma-specific types must remain inside infrastructure.

## Error categories

```text
VALIDATION
NOT_FOUND
NO_MATCHES
EXTERNAL_UNAVAILABLE
AI_UNAVAILABLE
CONFLICT
DATABASE_UNAVAILABLE
INTERNAL
```

HTTP layer maps them to safe JSON and status codes.

## Demo mode

`DEMO_DATA_MODE=true` uses deterministic fixture-backed university data where appropriate.

Normal tests never require live Gemini or College Scorecard calls.

## Database consistency

Use Prisma migrations as the single schema source.

Do not maintain one local schema and a separate production schema.

Deployment must apply pending migrations before the new backend instance becomes the active production process.
