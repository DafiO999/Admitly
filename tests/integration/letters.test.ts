import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { LetterDraftProvider } from '../../src/application/ports/letter-draft-provider.js';
import { letterDraftSentenceBank } from '../../src/domain/letter/draft-guard.js';
import { generatedLetterDraftsSchema, type GenerateLetterDraftsInput } from '../../src/domain/letter/schema.js';
import { normalizeGpa } from '../../src/domain/profile/normalize.js';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { PrismaLetterRepository } from '../../src/infrastructure/db/repositories/prisma-letter-repository.js';
import { PrismaUniversityContactRepository } from '../../src/infrastructure/db/repositories/prisma-university-contact-repository.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { seedDemoData } from '../../src/infrastructure/demo/seed.js';
import { getTestDatabaseUrl } from './test-database-url.js';

const databaseUrl = getTestDatabaseUrl(process.env);

function safeDrafts(input: GenerateLetterDraftsInput) {
  const bank = letterDraftSentenceBank(input);
  const question = bank.lines.find((line) => line.startsWith('Could '))!;
  return generatedLetterDraftsSchema.parse({ variants: [
    { variant: 'concise', subject: bank.subjects[0], body: [bank.lines[0], bank.lines[1], question, 'Sincerely,', input.sender.fullName].join('\n') },
    { variant: 'balanced', subject: bank.subjects[1], body: [bank.lines[0], bank.lines[1], bank.lines[2], question, 'Sincerely,', input.sender.fullName].join('\n') },
    { variant: 'detailed', subject: bank.subjects[2], body: bank.lines.join('\n') },
  ] });
}

describe('admission letter persistence and routes', () => {
  it.skipIf(databaseUrl === null)('creates, regenerates and edits without changing generation snapshots', async () => {
    const client = createPrismaClient(databaseUrl!);
    const contacts = new PrismaUniversityContactRepository(client);
    const letters = new PrismaLetterRepository(client);
    const profileId = randomUUID();
    const contactId = randomUUID();
    const universityId = demoUniversities[0]!.id;
    const profile = { ...canonicalDemoProfile, id: profileId };
    let invalidDraft = false;
    const provider: LetterDraftProvider = {
      generateLetterDrafts: async (input) => {
        const result = safeDrafts(input);
        if (invalidDraft) result.variants[0].body += '\nI have already been admitted.';
        return result;
      },
    };
    const app = buildApp({}, {
      contactRepository: contacts, letterRepository: letters, letterDraftProvider: provider,
    });
    try {
      await seedDemoData(client);
      await client.profile.create({ data: {
        id: profileId, payload: profile, profileHash: 'letter-test',
        targetField: profile.targetField, targetIntakeYear: profile.targetIntakeYear,
        gpaValue: profile.gpaValue, gpaScale: profile.gpaScale,
        gpaNormalized: normalizeGpa(profile.gpaValue, profile.gpaScale),
        annualBudgetUsd: profile.annualBudgetUsd,
      } });
      await contacts.upsert({
        id: contactId, universityId, kind: 'international_admissions',
        email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: false,
      });
      const createUrl = `/api/universities/${universityId}/letters`;
      const createBody = { profileId, purpose: 'admissions_inquiry',
        sender: { fullName: 'Alex Student', replyToEmail: 'alex@example.com' } };
      const inactive = await app.inject({ method: 'POST', url: createUrl, payload: createBody });
      expect(inactive.statusCode).toBe(404);
      expect(inactive.json().error.code).toBe('UNIVERSITY_EMAIL_UNAVAILABLE');
      await contacts.upsert({
        id: contactId, universityId, kind: 'international_admissions',
        email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
      });
      const override = await app.inject({ method: 'POST', url: createUrl,
        payload: { ...createBody, recipientEmail: 'attacker@example.com' } });
      expect(override.statusCode).toBe(400);
      const invalidReplyTo = await app.inject({ method: 'POST', url: createUrl,
        payload: { ...createBody, sender: { fullName: 'Alex Student', replyToEmail: 'bad' } } });
      expect(invalidReplyTo.json().error.code).toBe('INVALID_REPLY_TO');

      const created = await app.inject({ method: 'POST', url: createUrl, payload: createBody });
      expect(created.statusCode, created.body).toBe(200);
      expect(created.json().recipientEmail).toBe('admissions@example.edu');
      expect(created.json().letter.universityContactId).toBe(contactId);
      const letterId = created.json().letter.id as string;
      const draftUrl = `/api/letters/${letterId}/drafts`;
      const first = await app.inject({ method: 'POST', url: draftUrl, payload: {} });
      expect(first.statusCode, first.body).toBe(200);
      expect(first.json().variants.map((item: { variant: string }) => item.variant))
        .toEqual(['concise', 'balanced', 'detailed']);
      const firstGenerationId = first.json().generationId as string;
      const firstVariantId = first.json().variants[1].id as string;
      const secondLetter = await app.inject({ method: 'POST', url: createUrl, payload: createBody });
      expect(secondLetter.statusCode).toBe(200);
      const secondDrafts = await app.inject({
        method: 'POST', url: `/api/letters/${secondLetter.json().letter.id}/drafts`, payload: {},
      });
      expect(secondDrafts.statusCode).toBe(200);
      const crossLetterVariant = await app.inject({
        method: 'PUT', url: `/api/letters/${secondLetter.json().letter.id}/content`,
        payload: { sourceVariantId: firstVariantId, subject: 'Wrong letter', body: 'Wrong variant' },
      });
      expect(crossLetterVariant.statusCode).toBe(404);
      expect(crossLetterVariant.json().error.code).toBe('LETTER_NOT_FOUND');
      const originalVariant = await client.letterVariant.findUniqueOrThrow({ where: { id: firstVariantId } });
      const snapshot = await client.letterGeneration.findUniqueOrThrow({ where: { id: firstGenerationId } });
      expect(JSON.stringify(snapshot.inputSnapshot)).not.toContain('admissions@example.edu');
      await expect(client.letterVariant.update({
        where: { id: firstVariantId }, data: { body: 'Changed' },
      })).rejects.toThrow();
      await expect(client.letterGeneration.update({
        where: { id: firstGenerationId }, data: { promptVersion: 'changed' },
      })).rejects.toThrow();

      const final = await app.inject({ method: 'PUT', url: `/api/letters/${letterId}/content`, payload: {
        sourceVariantId: firstVariantId, subject: 'My edited subject', body: 'My edited final text',
      } });
      expect(final.statusCode, final.body).toBe(200);
      expect(final.json().letter).toMatchObject({
        status: 'draft_selected', selectedVariantId: firstVariantId,
        subject: 'My edited subject', body: 'My edited final text',
      });
      expect(await client.letterVariant.findUniqueOrThrow({ where: { id: firstVariantId } }))
        .toEqual(originalVariant);

      invalidDraft = true;
      const failed = await app.inject({ method: 'POST', url: draftUrl,
        payload: { additionalContext: 'I won a regional competition.' } });
      expect(failed.statusCode).toBe(502);
      expect(failed.json().error.code).toBe('AI_DRAFT_GENERATION_FAILED');
      expect(await client.letterGeneration.count({ where: { letterId } })).toBe(1);
      expect((await letters.findById(letterId))?.body).toBe('My edited final text');

      invalidDraft = false;
      const regenerated = await app.inject({ method: 'POST', url: draftUrl,
        payload: { additionalContext: 'I won a regional competition.' } });
      expect(regenerated.statusCode, regenerated.body).toBe(200);
      expect(regenerated.json().generationId).not.toBe(firstGenerationId);
      expect(await client.letterGeneration.count({ where: { letterId } })).toBe(2);
      expect((await letters.findById(letterId))?.body).toBe('My edited final text');
      expect((await client.letterGeneration.findUniqueOrThrow({ where: { id: firstGenerationId } })))
        .toEqual(snapshot);
    } finally {
      await app.close();
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.universityContact.deleteMany({ where: { id: contactId } });
      await client.$disconnect();
    }
  });
});
