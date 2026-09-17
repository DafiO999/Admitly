ALTER TABLE "Profile"
  ADD COLUMN "currentRoadmapId" UUID;

ALTER TABLE "Roadmap"
  ADD COLUMN "selectedUniversityIds" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "RoadmapItem"
  ADD COLUMN "position" INTEGER;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "roadmapId" ORDER BY "createdAt", "id") - 1 AS "newPosition"
  FROM "RoadmapItem"
)
UPDATE "RoadmapItem" AS item
SET "position" = numbered."newPosition"
FROM numbered
WHERE item."id" = numbered."id";

ALTER TABLE "RoadmapItem"
  ALTER COLUMN "position" SET NOT NULL,
  ALTER COLUMN "position" SET DEFAULT 0;

CREATE UNIQUE INDEX "RoadmapItem_roadmapId_position_key"
  ON "RoadmapItem"("roadmapId", "position");

CREATE INDEX "Profile_currentRoadmapId_idx" ON "Profile"("currentRoadmapId");

ALTER TABLE "Profile"
  ADD CONSTRAINT "Profile_currentRoadmapId_fkey"
  FOREIGN KEY ("currentRoadmapId") REFERENCES "Roadmap"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
