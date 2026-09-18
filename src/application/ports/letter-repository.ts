import type { StudentProfile, StudyField } from '../../domain/profile/schema.js';
import type {
  GeneratedLetterDrafts, GenerateLetterDraftsInput, LetterPurpose, LetterStatus,
} from '../../domain/letter/schema.js';

export interface LetterRecord {
  id: string;
  profileId: string;
  universityId: string;
  universityContactId: string;
  purpose: LetterPurpose;
  status: LetterStatus;
  senderName: string;
  replyToEmail: string;
  subject: string | null;
  body: string | null;
  selectedVariantId: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
}

export interface LetterGenerationRecord {
  generationId: string;
  promptVersion: string;
  variants: { id: string; variant: 'concise' | 'balanced' | 'detailed'; subject: string; body: string }[];
}

export interface LetterRepository {
  findProfile(profileId: string): Promise<StudentProfile | null>;
  findUniversity(universityId: string): Promise<{
    name: string; city?: string; state?: string; programs: { name: string; field: StudyField }[];
  } | null>;
  create(input: {
    profileId: string; universityId: string; universityContactId: string;
    purpose: LetterPurpose; senderName: string; replyToEmail: string;
  }): Promise<LetterRecord>;
  findById(letterId: string): Promise<LetterRecord | null>;
  saveGeneration(input: {
    letterId: string; promptVersion: string; additionalContext?: string;
    inputSnapshot: GenerateLetterDraftsInput; drafts: GeneratedLetterDrafts;
  }): Promise<LetterGenerationRecord>;
  saveFinalContent(input: {
    letterId: string; sourceVariantId: string; subject: string; body: string;
  }): Promise<LetterRecord>;
}

export class LetterNotFoundError extends Error {
  constructor() { super('Letter not found'); this.name = 'LetterNotFoundError'; }
}

export class LetterNotEditableError extends Error {
  constructor() { super('Letter is not editable'); this.name = 'LetterNotEditableError'; }
}

export class LetterVariantNotFoundError extends Error {
  constructor() { super('Letter variant not found'); this.name = 'LetterVariantNotFoundError'; }
}
