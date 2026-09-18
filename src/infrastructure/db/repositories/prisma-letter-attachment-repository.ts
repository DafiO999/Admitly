import { Prisma, type LetterAttachment, type PrismaClient } from '@prisma/client';
import {
  AttachmentNotFoundError, LetterAttachmentTotalLimitError,
  type LetterAttachmentRepository, type StoredAttachment,
} from '../../../application/ports/letter-attachment-repository.js';
import { LetterNotEditableError, LetterNotFoundError } from '../../../application/ports/letter-repository.js';
import { DatabaseUnavailableError } from '../../../application/ports/plan-repository.js';
import { attachmentMetadataSchema, type AttachmentMetadata } from '../../../domain/letter/attachment.js';

function toMetadata(row: LetterAttachment): AttachmentMetadata {
  return attachmentMetadataSchema.parse({
    id: row.id, originalName: row.originalName, mimeType: row.mimeType,
    sizeBytes: row.sizeBytes, sha256: row.sha256, createdAt: row.createdAt.toISOString(),
  });
}

function toStored(row: LetterAttachment): StoredAttachment {
  return { ...toMetadata(row), letterId: row.letterId, storageKey: row.storageKey };
}

function assertEditable(status: string): void {
  if (!['created', 'drafts_generated', 'draft_selected'].includes(status)) throw new LetterNotEditableError();
}

export class PrismaLetterAttachmentRepository implements LetterAttachmentRepository {
  constructor(private readonly client: PrismaClient) {}

  async list(letterId: string): Promise<AttachmentMetadata[]> {
    try {
      const rows = await this.client.letterAttachment.findMany({
        where: { letterId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      return rows.map(toMetadata);
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async find(letterId: string, attachmentId: string): Promise<StoredAttachment | null> {
    try {
      const row = await this.client.letterAttachment.findFirst({ where: { id: attachmentId, letterId } });
      return row ? toStored(row) : null;
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async add(input: Parameters<LetterAttachmentRepository['add']>[0]): Promise<AttachmentMetadata> {
    try {
      return await this.client.$transaction(async (tx) => {
        const letters = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status" FROM "AdmissionLetter" WHERE "id" = ${input.letterId}::uuid FOR UPDATE
        `;
        if (!letters[0]) throw new LetterNotFoundError();
        assertEditable(letters[0].status);
        const total = await tx.letterAttachment.aggregate({
          where: { letterId: input.letterId }, _sum: { sizeBytes: true },
        });
        if ((total._sum.sizeBytes ?? 0) + input.sizeBytes > input.maxTotalBytes) {
          throw new LetterAttachmentTotalLimitError();
        }
        const row = await tx.letterAttachment.create({ data: {
          letterId: input.letterId, originalName: input.originalName, storageKey: input.storageKey,
          mimeType: input.mimeType, sizeBytes: input.sizeBytes, sha256: input.sha256,
        } });
        return toMetadata(row);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof LetterNotFoundError || error instanceof LetterNotEditableError
        || error instanceof LetterAttachmentTotalLimitError) throw error;
      throw new DatabaseUnavailableError();
    }
  }

  async remove(letterId: string, attachmentId: string): Promise<void> {
    try {
      await this.client.$transaction(async (tx) => {
        const letters = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status" FROM "AdmissionLetter" WHERE "id" = ${letterId}::uuid FOR UPDATE
        `;
        if (!letters[0]) throw new LetterNotFoundError();
        assertEditable(letters[0].status);
        const row = await tx.letterAttachment.findFirst({ where: { id: attachmentId, letterId } });
        if (!row) throw new AttachmentNotFoundError();
        await tx.letterAttachment.delete({ where: { id: row.id } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof LetterNotFoundError || error instanceof LetterNotEditableError
        || error instanceof AttachmentNotFoundError) throw error;
      throw new DatabaseUnavailableError();
    }
  }
}
