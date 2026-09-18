import { Prisma, type AdmissionLetter, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  LetterNotEditableError, LetterNotFoundError, LetterVariantNotFoundError,
  type LetterGenerationRecord, type LetterRecord, type LetterRepository,
} from '../../../application/ports/letter-repository.js';
import { DatabaseUnavailableError } from '../../../application/ports/plan-repository.js';
import { studentProfileSchema } from '../../../domain/profile/schema.js';
import { programSummarySchema } from '../../../domain/university/schema.js';

const variantOrder = { concise: 0, balanced: 1, detailed: 2 } as const;

function toRecord(row: AdmissionLetter): LetterRecord {
  return {
    id: row.id, profileId: row.profileId, universityId: row.universityId,
    universityContactId: row.universityContactId, purpose: row.purpose,
    status: row.status, senderName: row.senderName, replyToEmail: row.replyToEmail,
    subject: row.subject, body: row.body, selectedVariantId: row.selectedVariantId,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export class PrismaLetterRepository implements LetterRepository {
  constructor(private readonly client: PrismaClient) {}

  async findProfile(profileId: string) {
    try {
      const row = await this.client.profile.findUnique({ where: { id: profileId }, select: { payload: true } });
      return row ? studentProfileSchema.parse(row.payload) : null;
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async findUniversity(universityId: string) {
    try {
      const row = await this.client.university.findUnique({
        where: { id: universityId }, select: { name: true, city: true, state: true, programs: true },
      });
      if (!row) return null;
      return {
        name: row.name,
        ...(row.city ? { city: row.city } : {}),
        ...(row.state ? { state: row.state } : {}),
        programs: z.array(programSummarySchema).parse(row.programs).map(({ name, field }) => ({ name, field })),
      };
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async create(input: Parameters<LetterRepository['create']>[0]): Promise<LetterRecord> {
    try {
      const row = await this.client.admissionLetter.create({ data: input });
      return toRecord(row);
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async findById(letterId: string): Promise<LetterRecord | null> {
    try {
      const row = await this.client.admissionLetter.findUnique({ where: { id: letterId } });
      return row ? toRecord(row) : null;
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async saveGeneration(input: Parameters<LetterRepository['saveGeneration']>[0]): Promise<LetterGenerationRecord> {
    try {
      return await this.client.$transaction(async (tx) => {
        const letter = await tx.admissionLetter.findUnique({ where: { id: input.letterId } });
        if (!letter) throw new LetterNotFoundError();
        if (!['created', 'drafts_generated', 'draft_selected'].includes(letter.status)) {
          throw new LetterNotEditableError();
        }
        const generation = await tx.letterGeneration.create({
          data: {
            letterId: input.letterId,
            promptVersion: input.promptVersion,
            additionalContext: input.additionalContext ?? null,
            inputSnapshot: JSON.parse(JSON.stringify(input.inputSnapshot)) as Prisma.InputJsonValue,
            variants: { create: input.drafts.variants.map((draft) => ({
              variant: draft.variant, subject: draft.subject, body: draft.body,
            })) },
          },
          include: { variants: true },
        });
        if (letter.status !== 'draft_selected') {
          await tx.admissionLetter.update({
            where: { id: letter.id }, data: { status: 'drafts_generated' },
          });
        }
        return {
          generationId: generation.id,
          promptVersion: generation.promptVersion,
          variants: generation.variants.sort((a, b) => variantOrder[a.variant] - variantOrder[b.variant])
            .map(({ id, variant, subject, body }) => ({ id, variant, subject, body })),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof LetterNotFoundError || error instanceof LetterNotEditableError) throw error;
      throw new DatabaseUnavailableError();
    }
  }

  async saveFinalContent(input: Parameters<LetterRepository['saveFinalContent']>[0]): Promise<LetterRecord> {
    try {
      return await this.client.$transaction(async (tx) => {
        const letter = await tx.admissionLetter.findUnique({ where: { id: input.letterId } });
        if (!letter) throw new LetterNotFoundError();
        if (!['drafts_generated', 'draft_selected'].includes(letter.status)) throw new LetterNotEditableError();
        const variant = await tx.letterVariant.findFirst({
          where: { id: input.sourceVariantId, generation: { letterId: input.letterId } },
          select: { id: true },
        });
        if (!variant) throw new LetterVariantNotFoundError();
        const updated = await tx.admissionLetter.update({
          where: { id: letter.id },
          data: {
            status: 'draft_selected', selectedVariantId: variant.id,
            subject: input.subject, body: input.body,
          },
        });
        return toRecord(updated);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof LetterNotFoundError || error instanceof LetterNotEditableError
        || error instanceof LetterVariantNotFoundError) throw error;
      throw new DatabaseUnavailableError();
    }
  }
}
