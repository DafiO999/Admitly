CREATE TYPE "AdmissionLetterPurpose" AS ENUM (
  'admissions_inquiry', 'application_follow_up', 'document_submission',
  'achievement_update', 'program_question', 'general'
);

CREATE TYPE "AdmissionLetterStatus" AS ENUM (
  'created', 'drafts_generated', 'draft_selected', 'ready_to_send',
  'sending', 'sent', 'failed'
);

CREATE TYPE "LetterVariantKind" AS ENUM ('concise', 'balanced', 'detailed');

CREATE TABLE "AdmissionLetter" (
  "id" UUID NOT NULL,
  "profileId" UUID NOT NULL,
  "universityId" TEXT NOT NULL,
  "universityContactId" UUID NOT NULL,
  "purpose" "AdmissionLetterPurpose" NOT NULL,
  "status" "AdmissionLetterStatus" NOT NULL DEFAULT 'created',
  "senderName" TEXT NOT NULL,
  "replyToEmail" TEXT NOT NULL,
  "subject" TEXT,
  "body" TEXT,
  "selectedVariantId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "AdmissionLetter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdmissionLetter_selected_content_check" CHECK (
    "status" NOT IN ('draft_selected', 'ready_to_send', 'sending', 'sent', 'failed')
    OR ("subject" IS NOT NULL AND "body" IS NOT NULL AND "selectedVariantId" IS NOT NULL)
  )
);

CREATE TABLE "LetterGeneration" (
  "id" UUID NOT NULL,
  "letterId" UUID NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "additionalContext" TEXT,
  "inputSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LetterGeneration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LetterVariant" (
  "id" UUID NOT NULL,
  "generationId" UUID NOT NULL,
  "variant" "LetterVariantKind" NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LetterVariant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdmissionLetter_profileId_createdAt_idx" ON "AdmissionLetter"("profileId", "createdAt");
CREATE INDEX "AdmissionLetter_universityId_status_idx" ON "AdmissionLetter"("universityId", "status");
CREATE INDEX "AdmissionLetter_universityContactId_idx" ON "AdmissionLetter"("universityContactId");
CREATE INDEX "LetterGeneration_letterId_createdAt_idx" ON "LetterGeneration"("letterId", "createdAt");
CREATE UNIQUE INDEX "LetterVariant_generationId_variant_key" ON "LetterVariant"("generationId", "variant");

ALTER TABLE "AdmissionLetter" ADD CONSTRAINT "AdmissionLetter_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdmissionLetter" ADD CONSTRAINT "AdmissionLetter_universityId_fkey"
  FOREIGN KEY ("universityId") REFERENCES "University"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdmissionLetter" ADD CONSTRAINT "AdmissionLetter_universityContactId_fkey"
  FOREIGN KEY ("universityContactId") REFERENCES "UniversityContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LetterGeneration" ADD CONSTRAINT "LetterGeneration_letterId_fkey"
  FOREIGN KEY ("letterId") REFERENCES "AdmissionLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LetterVariant" ADD CONSTRAINT "LetterVariant_generationId_fkey"
  FOREIGN KEY ("generationId") REFERENCES "LetterGeneration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION "prevent_letter_snapshot_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Letter generation snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "LetterGeneration_immutable_update"
  BEFORE UPDATE ON "LetterGeneration" FOR EACH ROW EXECUTE FUNCTION "prevent_letter_snapshot_update"();
CREATE TRIGGER "LetterVariant_immutable_update"
  BEFORE UPDATE ON "LetterVariant" FOR EACH ROW EXECUTE FUNCTION "prevent_letter_snapshot_update"();
