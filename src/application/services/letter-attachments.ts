import type { Readable } from 'node:stream';
import { z } from 'zod';
import type { FileStorage } from '../ports/file-storage.js';
import {
  AttachmentNotFoundError, UnsupportedAttachmentTypeError,
  type LetterAttachmentRepository,
} from '../ports/letter-attachment-repository.js';
import { LetterNotEditableError, LetterNotFoundError, type LetterRepository } from '../ports/letter-repository.js';
import { attachmentMimeTypeSchema, sanitizeAttachmentFilename } from '../../domain/letter/attachment.js';

function assertEditable(status: string): void {
  if (!['created', 'drafts_generated', 'draft_selected'].includes(status)) throw new LetterNotEditableError();
}

export async function uploadLetterAttachment(
  letterId: unknown,
  file: { filename: string; mimetype: string; stream: Readable; ensureComplete: () => Promise<void> },
  limits: { maxFileBytes: number; maxTotalBytes: number },
  letters: () => LetterRepository,
  attachments: () => LetterAttachmentRepository,
  storage: () => FileStorage,
) {
  const id = z.uuid().parse(letterId);
  const letter = await letters().findById(id);
  if (!letter) throw new LetterNotFoundError();
  assertEditable(letter.status);
  const mime = attachmentMimeTypeSchema.safeParse(file.mimetype);
  if (!mime.success) throw new UnsupportedAttachmentTypeError();
  const originalName = sanitizeAttachmentFilename(file.filename);
  const fileStorage = storage();
  const saved = await fileStorage.save({
    stream: file.stream, filename: originalName, mimeType: mime.data, maxBytes: limits.maxFileBytes,
  });
  try {
    await file.ensureComplete();
    const attachment = await attachments().add({
      letterId: id, originalName, storageKey: saved.storageKey,
      mimeType: mime.data, sizeBytes: saved.sizeBytes, sha256: saved.sha256,
      maxTotalBytes: limits.maxTotalBytes,
    });
    return { attachment };
  } catch (error) {
    await fileStorage.delete(saved.storageKey);
    throw error;
  }
}

export async function listLetterAttachments(
  letterId: unknown, letters: () => LetterRepository, attachments: () => LetterAttachmentRepository,
) {
  const id = z.uuid().parse(letterId);
  if (!await letters().findById(id)) throw new LetterNotFoundError();
  return { attachments: await attachments().list(id) };
}

export async function deleteLetterAttachment(
  letterId: unknown, attachmentId: unknown,
  letters: () => LetterRepository,
  attachments: () => LetterAttachmentRepository,
  storage: () => FileStorage,
) {
  const id = z.uuid().parse(letterId);
  const targetId = z.uuid().parse(attachmentId);
  const letter = await letters().findById(id);
  if (!letter) throw new LetterNotFoundError();
  assertEditable(letter.status);
  const repository = attachments();
  const attachment = await repository.find(id, targetId);
  if (!attachment) throw new AttachmentNotFoundError();
  const staged = await storage().stageDelete(attachment.storageKey);
  try {
    await repository.remove(id, targetId);
  } catch (error) {
    await staged.rollback();
    throw error;
  }
  await staged.commit();
  return { deleted: true };
}
