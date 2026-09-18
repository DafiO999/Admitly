import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { LetterAttachmentRepository } from '../../src/application/ports/letter-attachment-repository.js';
import type { LetterRepository } from '../../src/application/ports/letter-repository.js';
import { deleteLetterAttachment, uploadLetterAttachment } from '../../src/application/services/letter-attachments.js';
import { LocalFileStorage } from '../../src/infrastructure/storage/local-file-storage.js';

const pdf = Buffer.from('%PDF-1.4\nprivate certificate\n');
const letterId = randomUUID();
const letter = {
  id: letterId, profileId: randomUUID(), universityId: 'school-1', universityContactId: randomUUID(),
  purpose: 'admissions_inquiry' as const, status: 'draft_selected' as const,
  senderName: 'Alex Student', replyToEmail: 'alex@example.com',
  subject: 'Question', body: 'Hello', selectedVariantId: randomUUID(),
  createdAt: '2026-09-18T00:00:00.000Z', updatedAt: '2026-09-18T00:00:00.000Z',
};
const letters = { findById: async () => letter } as unknown as LetterRepository;

describe('attachment failure cleanup', () => {
  it('removes stored bytes if the database insert fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'admitly-failure-'));
    const storage = new LocalFileStorage(directory);
    const attachments = { add: async () => { throw new Error('database failed'); } } as unknown as LetterAttachmentRepository;
    try {
      await expect(uploadLetterAttachment(letterId, {
        filename: 'certificate.pdf', mimetype: 'application/pdf',
        stream: Readable.from([pdf]), ensureComplete: async () => undefined,
      }, { maxFileBytes: 1000, maxTotalBytes: 2000 }, () => letters, () => attachments, () => storage))
        .rejects.toThrow('database failed');
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('restores staged bytes if the database delete fails', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'admitly-failure-'));
    const storage = new LocalFileStorage(directory);
    const attachmentId = randomUUID();
    try {
      const saved = await storage.save({ stream: Readable.from([pdf]), filename: 'certificate.pdf',
        mimeType: 'application/pdf', maxBytes: 1000 });
      const attachments = {
        find: async () => ({
          id: attachmentId, letterId, storageKey: saved.storageKey,
          originalName: 'certificate.pdf', mimeType: 'application/pdf', sizeBytes: saved.sizeBytes,
          sha256: saved.sha256, createdAt: '2026-09-18T00:00:00.000Z',
        }),
        remove: async () => { throw new Error('database failed'); },
      } as unknown as LetterAttachmentRepository;
      await expect(deleteLetterAttachment(letterId, attachmentId,
        () => letters, () => attachments, () => storage)).rejects.toThrow('database failed');
      expect(await readdir(directory)).toEqual([saved.storageKey]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
