-- CreateEnum
CREATE TYPE "StudyField" AS ENUM ('computer_science', 'engineering', 'business', 'economics', 'design', 'other');

-- CreateEnum
CREATE TYPE "UniversityProviderKind" AS ENUM ('college_scorecard', 'curated', 'demo');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('official', 'verified', 'demo', 'unknown');

-- CreateEnum
CREATE TYPE "RequirementKind" AS ENUM ('application_deadline', 'english', 'sat_act', 'document', 'gpa', 'other');

-- CreateEnum
CREATE TYPE "RoadmapCategory" AS ENUM ('exam', 'document', 'application', 'academic', 'activity', 'research');

-- CreateEnum
CREATE TYPE "RoadmapStatus" AS ENUM ('pending', 'in_progress', 'done', 'blocked');

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "profileHash" TEXT NOT NULL,
    "targetField" "StudyField" NOT NULL,
    "targetIntakeYear" INTEGER NOT NULL,
    "gpaValue" DOUBLE PRECISION NOT NULL,
    "gpaScale" INTEGER NOT NULL,
    "gpaNormalized" DOUBLE PRECISION NOT NULL,
    "annualBudgetUsd" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "University" (
    "id" TEXT NOT NULL,
    "provider" "UniversityProviderKind" NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "state" TEXT,
    "websiteUrl" TEXT,
    "studentSize" INTEGER,
    "admissionRate" DOUBLE PRECISION,
    "tuitionOutOfStateUsd" INTEGER,
    "averageNetPriceUsd" INTEGER,
    "satMedian" INTEGER,
    "programs" JSONB NOT NULL,
    "dataYear" INTEGER,
    "sourceUrl" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "University_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdmissionRequirement" (
    "id" TEXT NOT NULL,
    "universityId" TEXT NOT NULL,
    "programKey" TEXT,
    "kind" "RequirementKind" NOT NULL,
    "label" TEXT NOT NULL,
    "valueText" TEXT NOT NULL,
    "numericValue" DOUBLE PRECISION,
    "date" DATE,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "sourceStatus" "SourceStatus" NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdmissionRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationRun" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "profileHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roadmap" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "recommendationRunId" UUID,
    "profileHash" TEXT NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "sourceCoverage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" UUID NOT NULL,
    "roadmapId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "RoadmapCategory" NOT NULL,
    "dueDate" DATE,
    "priority" INTEGER NOT NULL,
    "status" "RoadmapStatus" NOT NULL DEFAULT 'pending',
    "dependsOnIds" JSONB NOT NULL,
    "sourceUrl" TEXT,
    "sourceStatus" "SourceStatus",
    "isNextAction" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Profile_profileHash_idx" ON "Profile"("profileHash");

-- CreateIndex
CREATE INDEX "Profile_targetField_targetIntakeYear_idx" ON "Profile"("targetField", "targetIntakeYear");

-- CreateIndex
CREATE INDEX "University_name_idx" ON "University"("name");

-- CreateIndex
CREATE INDEX "University_state_idx" ON "University"("state");

-- CreateIndex
CREATE INDEX "AdmissionRequirement_universityId_kind_idx" ON "AdmissionRequirement"("universityId", "kind");

-- CreateIndex
CREATE INDEX "RecommendationRun_profileId_createdAt_idx" ON "RecommendationRun"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "Roadmap_profileId_createdAt_idx" ON "Roadmap"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "Roadmap_recommendationRunId_idx" ON "Roadmap"("recommendationRunId");

-- CreateIndex
CREATE INDEX "RoadmapItem_roadmapId_status_idx" ON "RoadmapItem"("roadmapId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_roadmapId_key_key" ON "RoadmapItem"("roadmapId", "key");

-- AddForeignKey
ALTER TABLE "AdmissionRequirement" ADD CONSTRAINT "AdmissionRequirement_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationRun" ADD CONSTRAINT "RecommendationRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roadmap" ADD CONSTRAINT "Roadmap_recommendationRunId_fkey" FOREIGN KEY ("recommendationRunId") REFERENCES "RecommendationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapItem" ADD CONSTRAINT "RoadmapItem_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "Roadmap"("id") ON DELETE CASCADE ON UPDATE CASCADE;
