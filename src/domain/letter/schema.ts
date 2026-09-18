import { z } from 'zod';
import type { StudyField } from '../profile/schema.js';

export const letterPurposeSchema = z.enum([
  'admissions_inquiry', 'application_follow_up', 'document_submission',
  'achievement_update', 'program_question', 'general',
]);
export type LetterPurpose = z.infer<typeof letterPurposeSchema>;

export const letterStatusSchema = z.enum([
  'created', 'drafts_generated', 'draft_selected', 'ready_to_send', 'sending', 'sent', 'failed', 'superseded',
]);
export type LetterStatus = z.infer<typeof letterStatusSchema>;

export const letterSenderSchema = z.object({
  fullName: z.string().trim().min(2).max(120).regex(/\S+\s+\S+/, 'Use a full name'),
  replyToEmail: z.email().max(254),
}).strict();
export type LetterSender = z.infer<typeof letterSenderSchema>;

export const createLetterRequestSchema = z.object({
  profileId: z.uuid(),
  purpose: letterPurposeSchema,
  sender: letterSenderSchema,
}).strict();

export const generateLetterDraftsRequestSchema = z.object({
  additionalContext: z.string().trim().min(1).max(1000).optional(),
}).strict();

export const letterContentRequestSchema = z.object({
  sourceVariantId: z.uuid(),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
}).strict();

export const letterVariantTypeSchema = z.enum(['concise', 'balanced', 'detailed']);
export type LetterVariantType = z.infer<typeof letterVariantTypeSchema>;

const generatedVariantFields = {
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
};
export const generatedLetterDraftsSchema = z.object({
  contextSentence: z.string().trim().min(1).max(500).regex(/^[^\r\n]+$/).optional(),
  variants: z.tuple([
    z.object({ variant: z.literal('concise'), ...generatedVariantFields }).strict(),
    z.object({ variant: z.literal('balanced'), ...generatedVariantFields }).strict(),
    z.object({ variant: z.literal('detailed'), ...generatedVariantFields }).strict(),
  ]),
}).strict();
export type GeneratedLetterDrafts = z.infer<typeof generatedLetterDraftsSchema>;

export interface GenerateLetterDraftsInput {
  sender: { fullName: string };
  profile: {
    targetField: StudyField;
    targetIntakeYear: number;
    normalizedGpa: number;
    englishExam?: { type: 'IELTS' | 'TOEFL' | 'DUOLINGO'; status: string; score?: number | undefined };
    sat?: { status: string; score?: number | undefined };
  };
  university: { name: string; city?: string; state?: string; relevantProgram?: string };
  purpose: LetterPurpose;
  additionalContext?: string;
}
