# Domain and data model

## StudentProfile

```ts
type StudyField =
  | "computer_science"
  | "engineering"
  | "business"
  | "economics"
  | "design"
  | "other";

type ExamStatus = "not_planned" | "planned" | "taken";

interface StudentProfile {
  id?: string;

  targetCountry: "US";
  targetDegree: "bachelor";
  targetField: StudyField;
  targetIntakeYear: number;

  gpaValue: number;
  gpaScale: 4 | 5 | 10 | 100;

  englishExam?: {
    type: "IELTS" | "TOEFL" | "DUOLINGO";
    status: ExamStatus;
    score?: number;
  };

  sat?: {
    status: ExamStatus;
    score?: number;
  };

  annualBudgetUsd: number;

  preferredStates?: string[];
  campusSize?: "small" | "medium" | "large" | "any";
}
```

Normalize GPA before scoring.

## University

```ts
type SourceStatus = "official" | "verified" | "demo" | "unknown";

interface University {
  id: string;
  provider: "college_scorecard" | "curated" | "demo";

  name: string;
  city?: string;
  state?: string;
  websiteUrl?: string;

  studentSize?: number;
  admissionRate?: number;

  tuitionOutOfStateUsd?: number;
  averageNetPriceUsd?: number;

  programs: ProgramSummary[];

  dataYear?: number;
  sourceUrl?: string;
  sourceStatus: SourceStatus;
}
```

## AdmissionRequirement

```ts
interface AdmissionRequirement {
  id: string;
  universityId: string;
  programKey?: string;

  kind:
    | "application_deadline"
    | "english"
    | "sat_act"
    | "document"
    | "gpa"
    | "other";

  label: string;
  valueText: string;

  numericValue?: number;
  date?: string;

  sourceUrl?: string;
  sourceTitle?: string;
  sourceStatus: SourceStatus;
  checkedAt?: string;
}
```

Validation invariant:

```text
sourceStatus in {official, verified}
=> sourceUrl is required
```

## Recommendation

```ts
interface ScoreComponent {
  key: "academic" | "program" | "budget" | "preferences";
  score: number;
  maxScore: number;
  reasons: string[];
}

interface Recommendation {
  universityId: string;
  fitScore: number;
  components: ScoreComponent[];
  reasonCodes: string[];
  concerns: {
    code: string;
    message: string;
  }[];
  explanation?: {
    summary: string;
    reasons: string[];
    concerns: string[];
  };
}
```

## Roadmap

```ts
type RoadmapStatus =
  | "pending"
  | "in_progress"
  | "done"
  | "blocked";

interface RoadmapItem {
  id: string;
  title: string;
  description?: string;

  category:
    | "exam"
    | "document"
    | "application"
    | "academic"
    | "activity"
    | "research";

  dueDate?: string;
  priority: number;
  status: RoadmapStatus;
  dependsOnIds: string[];

  sourceUrl?: string;
  sourceStatus?: SourceStatus;

  isNextAction: boolean;
}
```

## Persistence model

Prisma schema should represent at least:

```text
Profile
University
AdmissionRequirement
RecommendationRun
Roadmap
RoadmapItem
```

Use JSON only where the nested structure is genuinely easier to version than normalize.

Recommended approach:

- profile payload may be JSON plus indexed metadata if necessary;
- university programs may be JSON for MVP;
- roadmap items are first-class rows because they are individually updated;
- recommendation run result may be JSON snapshot plus `engineVersion`.

## Migrations

All schema changes are Prisma migrations:

```text
prisma/migrations/
```

Development:

```bash
npx prisma migrate dev
```

Production:

```bash
npx prisma migrate deploy
```

Never use `db push` as the canonical production schema migration mechanism.
