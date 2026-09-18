CREATE TYPE "LetterSendAttemptStatus" AS ENUM ('started', 'accepted', 'failed', 'ambiguous');

CREATE TABLE "LetterSendAttempt" (
  "id" UUID NOT NULL,
  "letterId" UUID NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "LetterSendAttemptStatus" NOT NULL DEFAULT 'started',
  "provider" TEXT NOT NULL DEFAULT 'smtp',
  "recipientEmail" TEXT NOT NULL,
  "providerMessageId" TEXT,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "LetterSendAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LetterSendAttempt_key_check" CHECK (length("idempotencyKey") BETWEEN 1 AND 128)
);

CREATE UNIQUE INDEX "LetterSendAttempt_letterId_idempotencyKey_key"
  ON "LetterSendAttempt"("letterId", "idempotencyKey");
CREATE INDEX "LetterSendAttempt_letterId_createdAt_idx"
  ON "LetterSendAttempt"("letterId", "createdAt");

ALTER TABLE "LetterSendAttempt" ADD CONSTRAINT "LetterSendAttempt_letterId_fkey"
  FOREIGN KEY ("letterId") REFERENCES "AdmissionLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
