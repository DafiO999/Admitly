import { Prisma, type LetterSendAttempt, type PrismaClient } from '@prisma/client';
import {
  LetterAlreadySentError, LetterNotReadyError, LetterSendInProgressError,
  type LetterDeliveryRepository, type SendAttemptRecord,
} from '../../../application/ports/letter-delivery-repository.js';
import { LetterNotFoundError } from '../../../application/ports/letter-repository.js';
import { DatabaseUnavailableError } from '../../../application/ports/plan-repository.js';
import { letterContentRequestSchema, letterSenderSchema } from '../../../domain/letter/schema.js';
import { toAttachmentMetadata, toStoredAttachment } from './prisma-letter-attachment-repository.js';
import { toLetterRecord } from './prisma-letter-repository.js';
import { selectedDraftIsCurrent } from './letter-context.js';
import { selectNextAction } from '../../../domain/roadmap/builder.js';
import { fromStoredItem } from './prisma-plan-repository.js';

const variantOrder = { concise: 0, balanced: 1, detailed: 2 } as const;

function toAttempt(row: LetterSendAttempt): SendAttemptRecord {
  return {
    id: row.id, letterId: row.letterId, idempotencyKey: row.idempotencyKey,
    status: row.status, provider: 'smtp', recipientEmail: row.recipientEmail,
    providerMessageId: row.providerMessageId, errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null,
  };
}

function assertContent(letter: {
  senderName: string; replyToEmail: string; selectedVariantId: string | null;
  subject: string | null; body: string | null;
}): void {
  const sender = letterSenderSchema.safeParse({ fullName: letter.senderName, replyToEmail: letter.replyToEmail });
  const content = letterContentRequestSchema.safeParse({
    sourceVariantId: letter.selectedVariantId, subject: letter.subject, body: letter.body,
  });
  if (!sender.success || !content.success) throw new LetterNotReadyError();
}

function assertAttachmentLimits(
  attachments: { sizeBytes: number }[], maxFileBytes: number, maxTotalBytes: number,
): void {
  if (attachments.some((item) => item.sizeBytes > maxFileBytes)
    || attachments.reduce((sum, item) => sum + item.sizeBytes, 0) > maxTotalBytes) {
    throw new LetterNotReadyError();
  }
}

type Transaction = Prisma.TransactionClient;

async function lockLetter(tx: Transaction, letterId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "AdmissionLetter" WHERE "id" = ${letterId}::uuid FOR UPDATE
  `;
  if (!locked[0]) throw new LetterNotFoundError();
  return tx.admissionLetter.findUniqueOrThrow({ where: { id: letterId } });
}

async function assertContact(
  tx: Transaction, letter: { universityId: string }, contactId: string, recipientEmail: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "UniversityContact"
    WHERE "id" = ${contactId}::uuid AND "universityId" = ${letter.universityId}
      AND "email" = ${recipientEmail} AND "active" = true
      AND "sourceStatus" IN ('official', 'verified')
    FOR SHARE
  `;
  if (!rows[0]) throw new LetterNotReadyError();
}

function rethrowKnown(error: unknown): never {
  if (error instanceof LetterNotFoundError || error instanceof LetterNotReadyError
    || error instanceof LetterAlreadySentError || error instanceof LetterSendInProgressError) throw error;
  throw new DatabaseUnavailableError();
}

export class PrismaLetterDeliveryRepository implements LetterDeliveryRepository {
  constructor(private readonly client: PrismaClient) {}

  async getDetail(letterId: string) {
    try {
      const row = await this.client.admissionLetter.findUnique({
        where: { id: letterId },
        include: {
          generations: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            include: { variants: true } },
          attachments: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
          sendAttempts: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
        },
      });
      if (!row) return null;
      return {
        letter: toLetterRecord(row),
        generations: row.generations.map((generation) => ({
          id: generation.id, promptVersion: generation.promptVersion,
          createdAt: generation.createdAt.toISOString(),
          variants: generation.variants.sort((a, b) => variantOrder[a.variant] - variantOrder[b.variant])
            .map((variant) => ({
              id: variant.id, variant: variant.variant, createdAt: variant.createdAt.toISOString(),
            })),
        })),
        attachments: row.attachments.map(toAttachmentMetadata),
        delivery: row.sendAttempts[0] ? toAttempt(row.sendAttempts[0]) : null,
      };
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async prepare(input: Parameters<LetterDeliveryRepository['prepare']>[0]) {
    try {
      const result = await this.client.$transaction(async (tx) => {
        const letter = await lockLetter(tx, input.letterId);
        if (letter.status !== 'draft_selected' && letter.status !== 'ready_to_send') {
          throw new LetterNotReadyError();
        }
        if (!await selectedDraftIsCurrent(tx, letter)) {
          await tx.admissionLetter.update({ where: { id: letter.id }, data: { status: 'superseded' } });
          return null;
        }
        assertContent(letter);
        await assertContact(tx, letter, input.contactId, input.recipientEmail);
        const attachments = await tx.letterAttachment.findMany({ where: { letterId: input.letterId } });
        assertAttachmentLimits(attachments, input.maxFileBytes, input.maxTotalBytes);
        const updated = await tx.admissionLetter.update({ where: { id: letter.id },
          data: { status: 'ready_to_send', universityContactId: input.contactId } });
        return toLetterRecord(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!result) throw new LetterNotReadyError();
      return result;
    } catch (error) {
      rethrowKnown(error);
    }
  }

  async findAttempt(letterId: string, key: string): Promise<SendAttemptRecord | null> {
    try {
      const row = await this.client.letterSendAttempt.findUnique({
        where: { letterId_idempotencyKey: { letterId, idempotencyKey: key } },
      });
      return row ? toAttempt(row) : null;
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async claim(input: Parameters<LetterDeliveryRepository['claim']>[0]) {
    try {
      const result = await this.client.$transaction(async (tx) => {
        const letter = await lockLetter(tx, input.letterId);
        const previous = await tx.letterSendAttempt.findUnique({
          where: { letterId_idempotencyKey: { letterId: input.letterId, idempotencyKey: input.key } },
        });
        if (previous) return { kind: 'previous' as const, letter: toLetterRecord(letter), attempt: toAttempt(previous) };
        if (letter.status === 'sent') throw new LetterAlreadySentError();
        if (letter.status === 'sending') throw new LetterSendInProgressError();
        if (letter.status !== 'ready_to_send') throw new LetterNotReadyError();
        if (!await selectedDraftIsCurrent(tx, letter)) {
          await tx.admissionLetter.update({ where: { id: letter.id }, data: { status: 'superseded' } });
          return null;
        }
        assertContent(letter);
        await assertContact(tx, letter, input.contactId, input.recipientEmail);
        const attachments = await tx.letterAttachment.findMany({
          where: { letterId: input.letterId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        assertAttachmentLimits(attachments, input.maxFileBytes, input.maxTotalBytes);
        const attempt = await tx.letterSendAttempt.create({ data: {
          letterId: input.letterId, idempotencyKey: input.key,
          recipientEmail: input.recipientEmail, status: 'started', provider: 'smtp',
        } });
        const updated = await tx.admissionLetter.update({ where: { id: letter.id },
          data: { status: 'sending', universityContactId: input.contactId } });
        return {
          kind: 'claimed' as const, letter: toLetterRecord(updated), attempt: toAttempt(attempt),
          attachments: attachments.map(toStoredAttachment),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!result) throw new LetterNotReadyError();
      return result;
    } catch (error) {
      rethrowKnown(error);
    }
  }

  async finish(input: Parameters<LetterDeliveryRepository['finish']>[0]) {
    try {
      return await this.client.$transaction(async (tx) => {
        const owner = await tx.admissionLetter.findUnique({
          where: { id: input.letterId }, select: { profileId: true },
        });
        if (!owner) throw new LetterNotFoundError();
        await tx.$queryRaw`SELECT "id" FROM "Profile" WHERE "id" = ${owner.profileId}::uuid FOR UPDATE`;
        const letter = await lockLetter(tx, input.letterId);
        const attempt = await tx.letterSendAttempt.findUnique({ where: { id: input.attemptId } });
        if (!attempt || attempt.letterId !== input.letterId) throw new LetterNotFoundError();
        if (attempt.status !== 'started' || letter.status !== 'sending') throw new LetterSendInProgressError();
        const completed = await tx.letterSendAttempt.update({ where: { id: attempt.id }, data: {
          status: input.status, providerMessageId: input.providerMessageId ?? null,
          errorCode: input.errorCode ?? null, completedAt: new Date(),
        } });
        const updated = await tx.admissionLetter.update({ where: { id: letter.id }, data: {
          status: input.status === 'accepted' ? 'sent' : 'failed',
          ...(input.status === 'accepted' ? { sentAt: new Date() } : {}),
        } });
        if (input.status === 'accepted' && await selectedDraftIsCurrent(tx, letter)) {
          const profile = await tx.profile.findUnique({
            where: { id: letter.profileId }, select: { currentRoadmapId: true },
          });
          if (profile?.currentRoadmapId) {
            const roadmap = await tx.roadmap.findUnique({
              where: { id: profile.currentRoadmapId },
              include: { items: { orderBy: { position: 'asc' } } },
            });
            const target = roadmap?.items.find((item) =>
              item.key === `school:${letter.universityId}:email` && item.category === 'university_email');
            if (roadmap && target) {
              await tx.roadmapItem.update({ where: { id: target.id }, data: { status: 'done' } });
              const items = roadmap.items.map((item) => fromStoredItem({
                ...item, status: item.id === target.id ? 'done' : item.status, isNextAction: false,
              }));
              const nextActionId = selectNextAction(items);
              await tx.roadmapItem.updateMany({ where: { roadmapId: roadmap.id }, data: { isNextAction: false } });
              if (nextActionId) {
                await tx.roadmapItem.update({ where: { roadmapId_key: { roadmapId: roadmap.id,
                  key: nextActionId } }, data: { isNextAction: true } });
              }
            }
          }
        }
        return { letter: toLetterRecord(updated), attempt: toAttempt(completed) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    } catch (error) {
      rethrowKnown(error);
    }
  }
}
