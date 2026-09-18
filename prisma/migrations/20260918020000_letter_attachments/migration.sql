CREATE TABLE "LetterAttachment" (
  "id" UUID NOT NULL,
  "letterId" UUID NOT NULL,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LetterAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LetterAttachment_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "LetterAttachment_mime_check" CHECK ("mimeType" IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT "LetterAttachment_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "LetterAttachment_storageKey_key" ON "LetterAttachment"("storageKey");
CREATE INDEX "LetterAttachment_letterId_createdAt_idx" ON "LetterAttachment"("letterId", "createdAt");

ALTER TABLE "LetterAttachment" ADD CONSTRAINT "LetterAttachment_letterId_fkey"
  FOREIGN KEY ("letterId") REFERENCES "AdmissionLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
