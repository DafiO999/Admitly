# Project specification

## Goal

Admitly converts an applicant profile into an explainable admission route.

Backend outputs support:

1. normalized profile;
2. deterministic diagnosis;
3. at least 3 university/program recommendations;
4. comparison-ready data for at least 2 options;
5. personalized roadmap;
6. exactly one next action;
7. recalculation after important profile changes;
8. persistence in PostgreSQL.

## Scope

- U.S. undergraduate admissions;
- deterministic fit scoring;
- College Scorecard for institution/program metrics;
- curated requirement/deadline records with source metadata;
- Gemini only for language/explanation;
- PostgreSQL persistence through Prisma;
- local-first development;
- later deployment to a self-hosted Linux server.

## Explicit non-goals

Do not implement:

- frontend;
- Vercel;
- Supabase;
- managed auth platform;
- chat-first product;
- admission-probability model;
- multi-country admissions rules;
- LMS/course system;
- essay editor;
- scholarship engine;
- large-scale crawler;
- microservices;
- Redis/Kafka;
- vector database/RAG framework unless later requirements explicitly add one.

## Core behavior

### Profile

Required signals:

- target field;
- target intake year;
- GPA and scale;
- annual budget;
- optional state/campus preferences;
- English exam status/score;
- SAT status/score.

### Diagnosis

Must return:

- goal summary;
- strengths;
- constraints;
- focus-now items.

Must work without Gemini.

### Recommendations

Return 3–5 ranked universities for the canonical demo fixture.

Each result contains:

- normalized university data;
- fit score 0–100;
- component breakdown;
- deterministic reason codes;
- concerns;
- optional AI explanation.

`fitScore` means profile match, not admission probability.

### Comparison

Expose normalized data sufficient to compare 2–3 institutions.

### Roadmap

Return roadmap items containing:

- title;
- category;
- due date if known;
- priority;
- dependencies;
- status;
- source metadata;
- `isNextAction`.

Exactly one incomplete actionable item may be the next action.

### Recalculation

Changing canonical fixture values must demonstrate deterministic behavior changes for:

- budget;
- target field;
- SAT status/score where reference data exists.

## Data truth

Every factual admissions datum has:

```text
official | verified | demo | unknown
```

AI output is never itself a verified source.

## Runtime modes

### Local development

Primary mode:

```text
backend on host machine
PostgreSQL in compose.dev.yml
```

### Production

Primary mode:

```text
Caddy container
backend container
PostgreSQL container + persistent volume
```

The same Prisma schema and migrations are used in both environments.
