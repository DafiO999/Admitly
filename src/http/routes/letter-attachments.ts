import type { FastifyPluginAsync } from 'fastify';
import type { FileStorage } from '../../application/ports/file-storage.js';
import {
  AttachmentTooLargeError, InvalidFileError, type LetterAttachmentRepository,
} from '../../application/ports/letter-attachment-repository.js';
import type { LetterRepository } from '../../application/ports/letter-repository.js';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import {
  deleteLetterAttachment, listLetterAttachments, uploadLetterAttachment,
} from '../../application/services/letter-attachments.js';
import { apiPaths } from './paths.js';
import { requireProfileAccess } from '../profile-access.js';
import { z } from 'zod';

export function letterAttachmentRoutes(
  letters: () => LetterRepository,
  attachments: () => LetterAttachmentRepository,
  storage: () => FileStorage,
  limits: () => { maxFileBytes: number; maxTotalBytes: number },
  plans: () => PlanRepository,
  accessSecret: () => string,
): FastifyPluginAsync {
  return async (app) => {
    const requireLetter = async (request: Parameters<typeof requireProfileAccess>[0], letterId: string) => {
      const profileId = await plans().findLetterProfileId(z.uuid().parse(letterId));
      if (profileId) requireProfileAccess(request, profileId, accessSecret());
    };
    app.post<{ Params: { letterId: string } }>(apiPaths.letterAttachments, async (request) => {
      await requireLetter(request, request.params.letterId);
      if (!request.isMultipart()) throw new InvalidFileError();
      const bounds = limits();
      const parts = request.parts({ limits: {
        files: 2, fields: 1, parts: 2, fileSize: bounds.maxFileBytes + 1,
      } });
      let stream: import('node:stream').Readable | undefined;
      try {
        const first = await parts.next();
        if (first.done || first.value.type !== 'file' || first.value.fieldname !== 'file') throw new InvalidFileError();
        stream = first.value.file;
        return await uploadLetterAttachment(request.params.letterId, {
          filename: first.value.filename, mimetype: first.value.mimetype, stream,
          ensureComplete: async () => {
            let hasExtraPart = false;
            for await (const extra of parts) {
              hasExtraPart = true;
              if (extra.type === 'file') {
                for await (const chunk of extra.file) { void chunk; }
              }
            }
            if (hasExtraPart) throw new InvalidFileError();
          },
        }, bounds, letters, attachments, storage);
      } catch (error) {
        stream?.destroy();
        if (error instanceof app.multipartErrors.RequestFileTooLargeError) throw new AttachmentTooLargeError();
        if (error instanceof app.multipartErrors.FilesLimitError
          || error instanceof app.multipartErrors.PartsLimitError
          || error instanceof app.multipartErrors.FieldsLimitError
          || error instanceof app.multipartErrors.InvalidMultipartContentTypeError) {
          throw new InvalidFileError();
        }
        throw error;
      }
    });
    app.get<{ Params: { letterId: string } }>(apiPaths.letterAttachments, async (request) => {
      await requireLetter(request, request.params.letterId);
      return listLetterAttachments(request.params.letterId, letters, attachments);
    });
    app.delete<{ Params: { letterId: string; attachmentId: string } }>(apiPaths.letterAttachment, async (request) => {
      await requireLetter(request, request.params.letterId);
      return deleteLetterAttachment(request.params.letterId, request.params.attachmentId, letters, attachments, storage);
    });
  };
}
