import type { LetterRecord } from './letter-repository.js';
import type { StoredAttachment } from './letter-attachment-repository.js';
import type { AttachmentMetadata } from '../../domain/letter/attachment.js';

export type SendAttemptStatus = 'started' | 'accepted' | 'failed' | 'ambiguous';

export interface SendAttemptRecord {
  id: string;
  letterId: string;
  idempotencyKey: string;
  status: SendAttemptStatus;
  provider: 'smtp';
  recipientEmail: string;
  providerMessageId: string | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface LetterDetail {
  letter: LetterRecord;
  generations: { id: string; promptVersion: string; createdAt: string;
    variants: { id: string; variant: 'concise' | 'balanced' | 'detailed'; createdAt: string }[] }[];
  attachments: AttachmentMetadata[];
  delivery: SendAttemptRecord | null;
}

export interface LetterDeliveryRepository {
  getDetail(letterId: string): Promise<LetterDetail | null>;
  prepare(input: { letterId: string; contactId: string; recipientEmail: string;
    maxFileBytes: number; maxTotalBytes: number }): Promise<LetterRecord>;
  findAttempt(letterId: string, key: string): Promise<SendAttemptRecord | null>;
  claim(input: { letterId: string; key: string; contactId: string; recipientEmail: string;
    maxFileBytes: number; maxTotalBytes: number }): Promise<
      | { kind: 'claimed'; letter: LetterRecord; attempt: SendAttemptRecord; attachments: StoredAttachment[] }
      | { kind: 'previous'; letter: LetterRecord; attempt: SendAttemptRecord }
    >;
  finish(input: { letterId: string; attemptId: string; status: Exclude<SendAttemptStatus, 'started'>;
    providerMessageId?: string | null; errorCode?: string | null }): Promise<{
      letter: LetterRecord; attempt: SendAttemptRecord;
    }>;
}

export class LetterNotReadyError extends Error {
  constructor() { super('Letter is not ready to send'); this.name = 'LetterNotReadyError'; }
}

export class LetterAlreadySentError extends Error {
  constructor() { super('Letter already sent'); this.name = 'LetterAlreadySentError'; }
}

export class LetterSendInProgressError extends Error {
  constructor() { super('Letter send already in progress'); this.name = 'LetterSendInProgressError'; }
}
