ALTER TYPE "RoadmapCategory" ADD VALUE 'university_email';
ALTER TYPE "AdmissionLetterStatus" ADD VALUE 'superseded';

ALTER TABLE "LetterGeneration"
  ADD COLUMN "profileHash" TEXT,
  ADD COLUMN "universityHash" TEXT;
