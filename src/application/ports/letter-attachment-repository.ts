import type { AttachmentMetadata, AttachmentMimeType } from '../../domain/letter/attachment.js';

export interface StoredAttachment extends AttachmentMetadata {
  letterId: string;
  storageKey: string;
}

export interface LetterAttachmentRepository {
  list(letterId: string): Promise<AttachmentMetadata[]>;
  find(letterId: string, attachmentId: string): Promise<StoredAttachment | null>;
  add(input: {
    letterId: string; originalName: string; storageKey: string; mimeType: AttachmentMimeType;
    sizeBytes: number; sha256: string; maxTotalBytes: number;
  }): Promise<AttachmentMetadata>;
  remove(letterId: string, attachmentId: string): Promise<void>;
}

export class AttachmentTooLargeError extends Error {
  constructor() { super('Attachment too large'); this.name = 'AttachmentTooLargeError'; }
}

export class LetterAttachmentTotalLimitError extends Error {
  constructor() { super('Letter attachment total limit exceeded'); this.name = 'LetterAttachmentTotalLimitError'; }
}

export class UnsupportedAttachmentTypeError extends Error {
  constructor() { super('Unsupported attachment type'); this.name = 'UnsupportedAttachmentTypeError'; }
}

export class InvalidFileError extends Error {
  constructor() { super('Invalid file'); this.name = 'InvalidFileError'; }
}

export class AttachmentNotFoundError extends Error {
  constructor() { super('Attachment not found'); this.name = 'AttachmentNotFoundError'; }
}
