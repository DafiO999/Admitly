CREATE TYPE "UniversityContactKind" AS ENUM (
  'undergraduate_admissions', 'international_admissions', 'general_admissions'
);

CREATE TABLE "UniversityContact" (
  "id" UUID NOT NULL,
  "universityId" TEXT NOT NULL,
  "kind" "UniversityContactKind" NOT NULL,
  "email" TEXT NOT NULL,
  "sourceUrl" TEXT NOT NULL,
  "sourceTitle" TEXT,
  "sourceStatus" "SourceStatus" NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UniversityContact_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UniversityContact_verified_source_check" CHECK (
    "sourceStatus" IN ('official', 'verified')
    AND "sourceUrl" ~ '^https://[^[:space:]]+$'
  )
);

CREATE INDEX "UniversityContact_universityId_active_idx"
  ON "UniversityContact"("universityId", "active");

ALTER TABLE "UniversityContact" ADD CONSTRAINT "UniversityContact_universityId_fkey"
  FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;
