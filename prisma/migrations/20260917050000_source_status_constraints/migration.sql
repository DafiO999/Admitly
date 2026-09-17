ALTER TABLE "University"
  ADD CONSTRAINT "University_verified_source_check"
  CHECK ("sourceStatus" NOT IN ('official', 'verified') OR "sourceUrl" IS NOT NULL);

ALTER TABLE "AdmissionRequirement"
  ADD CONSTRAINT "AdmissionRequirement_verified_source_check"
  CHECK ("sourceStatus" NOT IN ('official', 'verified') OR "sourceUrl" IS NOT NULL);

ALTER TABLE "RoadmapItem"
  ADD CONSTRAINT "RoadmapItem_due_date_source_check"
  CHECK (
    ("dueDate" IS NULL OR ("sourceStatus" IS NOT NULL AND "sourceStatus" IN ('official', 'verified', 'demo')))
    AND ("sourceStatus" IS NULL OR "sourceStatus" NOT IN ('official', 'verified') OR "sourceUrl" IS NOT NULL)
  );
