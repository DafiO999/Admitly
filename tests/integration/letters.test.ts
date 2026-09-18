import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { LetterDraftProvider } from '../../src/application/ports/letter-draft-provider.js';
import type { MailProvider } from '../../src/application/ports/mail-provider.js';
import { letterDraftSentenceBank } from '../../src/domain/letter/draft-guard.js';
import { generatedLetterDraftsSchema, type GenerateLetterDraftsInput } from '../../src/domain/letter/schema.js';
import { normalizeGpa } from '../../src/domain/profile/normalize.js';
import { buildRoadmap } from '../../src/domain/roadmap/builder.js';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { PrismaLetterRepository } from '../../src/infrastructure/db/repositories/prisma-letter-repository.js';
import { PrismaLetterAttachmentRepository } from '../../src/infrastructure/db/repositories/prisma-letter-attachment-repository.js';
import { PrismaLetterDeliveryRepository } from '../../src/infrastructure/db/repositories/prisma-letter-delivery-repository.js';
import { PrismaUniversityContactRepository } from '../../src/infrastructure/db/repositories/prisma-university-contact-repository.js';
import { PrismaPlanRepository } from '../../src/infrastructure/db/repositories/prisma-plan-repository.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { LocalFileStorage } from '../../src/infrastructure/storage/local-file-storage.js';
import { getTestDatabaseUrl } from './test-database-url.js';

const databaseUrl = getTestDatabaseUrl(process.env);
const pdf = Buffer.from('%PDF-1.4\nprivate certificate\n');

function multipartFile(filename: string, mimetype: string, content: Buffer) {
  const boundary = 'admitly-attachment-boundary';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

function multipartTwoFiles(content: Buffer) {
  const boundary = 'admitly-attachment-boundary';
  const part = (name: string) => Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
    content,
    Buffer.from('\r\n'),
  ]);
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([part('one.pdf'), part('two.pdf'), Buffer.from(`--${boundary}--\r\n`)]),
  };
}

function safeDrafts(input: GenerateLetterDraftsInput) {
  const contextSentence = input.additionalContext;
  const bank = letterDraftSentenceBank(input, contextSentence);
  const question = bank.lines.find((line) => line.startsWith('Could '))!;
  const context = contextSentence ? [contextSentence] : [];
  return generatedLetterDraftsSchema.parse({ ...(contextSentence ? { contextSentence } : {}), variants: [
    { variant: 'concise', subject: bank.subjects[0], body: [bank.lines[0], bank.lines[1], ...context, question, 'Sincerely,', input.sender.fullName].join('\n') },
    { variant: 'balanced', subject: bank.subjects[1], body: [bank.lines[0], bank.lines[1], bank.lines[2], ...context, question, 'Thank you for your time and guidance.', 'Sincerely,', input.sender.fullName].join('\n') },
    { variant: 'detailed', subject: bank.subjects[2], body: bank.lines.join('\n') },
  ] });
}

describe('admission letter persistence and routes', () => {
  it.skipIf(databaseUrl === null)('creates, regenerates and edits without changing generation snapshots', async () => {
    const client = createPrismaClient(databaseUrl!);
    const contacts = new PrismaUniversityContactRepository(client);
    const letters = new PrismaLetterRepository(client);
    const attachments = new PrismaLetterAttachmentRepository(client);
    const delivery = new PrismaLetterDeliveryRepository(client);
    const plans = new PrismaPlanRepository(client);
    const uploadDir = await mkdtemp(join(tmpdir(), 'admitly-integration-files-'));
    const storage = new LocalFileStorage(uploadDir);
    const profileId = randomUUID();
    const contactId = randomUUID();
    const universityId = `letter-test-${randomUUID()}`;
    const otherContactId = randomUUID();
    const otherUniversityId = `letter-test-${randomUUID()}`;
    const profile = { ...canonicalDemoProfile, id: profileId };
    let invalidDraft = false;
    const provider: LetterDraftProvider = {
      generateLetterDrafts: async (input) => {
        const result = safeDrafts(input);
        if (invalidDraft) result.variants[0].body += '\nI have already been admitted.';
        return result;
      },
    };
    const sentMessages: { to: string; replyTo: string; subject: string; body: string;
      attachments: { filename: string; bytes: Buffer }[] }[] = [];
    let sendCount = 0;
    let sendGate: Promise<void> | null = null;
    let onSendStarted: (() => void) | null = null;
    let sendFailure: Error | null = null;
    const logs: string[] = [];
    const logStream = new Writable({ write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    } });
    const mailProvider: MailProvider = { send: async (input) => {
      sendCount += 1;
      const files = [];
      for (const attachment of input.attachments) {
        const chunks: Buffer[] = [];
        for await (const chunk of attachment.content) chunks.push(Buffer.from(chunk));
        files.push({ filename: attachment.filename, bytes: Buffer.concat(chunks) });
      }
      sentMessages.push({ to: input.to, replyTo: input.replyTo.email,
        subject: input.subject, body: input.body, attachments: files });
      if (sendFailure) throw sendFailure;
      onSendStarted?.();
      if (sendGate) await sendGate;
      return { providerMessageId: `<smtp-${sendCount}@example.test>` };
    } };
    const app = buildApp({ logger: { stream: logStream } }, {
      contactRepository: contacts, letterRepository: letters, letterDraftProvider: provider,
      planRepository: plans,
      attachmentRepository: attachments, deliveryRepository: delivery, fileStorage: storage,
      mailProvider,
      mailDeliveryMode: 'smtp',
      attachmentLimits: { maxFileBytes: 50, maxTotalBytes: 40 },
    });
    try {
      await client.university.create({ data: {
        id: universityId, provider: 'demo', name: 'Test University',
        programs: demoUniversities[0]!.programs, sourceStatus: 'demo',
      } });
      await client.university.create({ data: {
        id: otherUniversityId, provider: 'demo', name: 'Other University',
        programs: demoUniversities[1]!.programs, sourceStatus: 'demo',
      } });
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
      await contacts.upsert({
        id: otherContactId, universityId: otherUniversityId, kind: 'international_admissions',
        email: 'other@example.edu', sourceUrl: 'https://other.example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
      });
      const university = { ...demoUniversities[0]!, id: universityId, name: 'Test University' };
      const otherUniversity = { ...demoUniversities[1]!, id: otherUniversityId, name: 'Other University' };
      const generatedPlan = buildRoadmap(profile, [{ university, requirements: [],
        admissionsContact: { email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
          sourceStatus: 'official' } }, { university: otherUniversity, requirements: [],
        admissionsContact: { email: 'other@example.edu', sourceUrl: 'https://other.example.edu/admissions',
          sourceStatus: 'official' } }]);
      const savedPlan = await plans.saveGenerated({
        profile, engineVersion: 'letter-test', recommendations: [],
        selectedUniversityIds: [universityId, otherUniversityId], ...generatedPlan,
        promptVersions: { diagnosis: 'test', recommendationExplanation: 'test', roadmap: 'test' },
      });
      const emailKey = `school:${universityId}:email`;
      const planUrl = `/api/plan/${profileId}`;
      expect(savedPlan.roadmap.items.find((item) => item.id === emailKey)?.letter).toEqual({
        universityId, recipientEmail: 'admissions@example.edu', body: '',
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
      const attachmentsUrl = `/api/letters/${letterId}/attachments`;
      const uploaded = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('..\\..\\certificate.pdf', 'application/pdf', pdf) });
      expect(uploaded.statusCode, uploaded.body).toBe(200);
      expect(uploaded.json().attachment).toMatchObject({ originalName: 'certificate.pdf',
        mimeType: 'application/pdf', sizeBytes: pdf.length });
      expect(uploaded.body).not.toContain('storageKey');
      expect(uploaded.body).not.toContain(uploadDir);
      const attachmentId = uploaded.json().attachment.id as string;
      const storedAttachment = await client.letterAttachment.findUniqueOrThrow({ where: { id: attachmentId } });
      expect((await app.inject({ method: 'GET', url: `/data/uploads/${storedAttachment.storageKey}` })).statusCode)
        .toBe(404);
      const listed = await app.inject({ method: 'GET', url: attachmentsUrl });
      expect(listed.json().attachments).toEqual([uploaded.json().attachment]);
      expect(await readdir(uploadDir)).toHaveLength(1);
      const badType = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('note.txt', 'text/plain', Buffer.from('hello')) });
      expect(badType.statusCode).toBe(415);
      expect(badType.json().error.code).toBe('UNSUPPORTED_ATTACHMENT_TYPE');
      const badSignature = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('fake.pdf', 'application/pdf', Buffer.from('not a PDF')) });
      expect(badSignature.statusCode).toBe(400);
      expect(badSignature.json().error.code).toBe('INVALID_FILE');
      const tooLarge = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('large.pdf', 'application/pdf', Buffer.concat([pdf, Buffer.alloc(30)])) });
      expect(tooLarge.statusCode).toBe(413);
      expect(tooLarge.json().error.code).toBe('ATTACHMENT_TOO_LARGE');
      const totalLimit = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('second.pdf', 'application/pdf', pdf) });
      expect(totalLimit.statusCode).toBe(413);
      expect(totalLimit.json().error.code).toBe('LETTER_ATTACHMENT_TOTAL_LIMIT');
      const extraFile = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartTwoFiles(pdf) });
      expect(extraFile.statusCode).toBe(400);
      expect(extraFile.json().error.code).toBe('INVALID_FILE');
      expect(await readdir(uploadDir)).toHaveLength(1);
      expect(await client.letterAttachment.count({ where: { letterId } })).toBe(1);
      const deleted = await app.inject({ method: 'DELETE', url: `${attachmentsUrl}/${attachmentId}` });
      expect(deleted.statusCode, deleted.body).toBe(200);
      expect(deleted.json()).toEqual({ deleted: true });
      expect(await readdir(uploadDir)).toEqual([]);
      expect(await client.letterAttachment.count({ where: { letterId } })).toBe(0);
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
      const draftPlan = await app.inject({ method: 'GET', url: planUrl });
      expect(draftPlan.statusCode, draftPlan.body).toBe(200);
      expect(draftPlan.json().roadmap.items.find((item: { id: string }) => item.id === emailKey).letter)
        .toEqual({ universityId, recipientEmail: 'admissions@example.edu', body: 'My edited final text' });
      expect(draftPlan.json().roadmap.items.find((item: { id: string }) =>
        item.id === `school:${otherUniversityId}:email`).letter).toEqual({
        universityId: otherUniversityId, recipientEmail: 'other@example.edu', body: '',
      });
      expect(draftPlan.body).not.toContain('selectedVariantId');
      expect(draftPlan.body).not.toContain('inputSnapshot');
      expect(draftPlan.body).not.toContain('providerMessageId');
      expect(draftPlan.body).not.toContain('attachments');
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

      const beforePrepare = await app.inject({ method: 'GET', url: `/api/letters/${letterId}` });
      expect(beforePrepare.statusCode).toBe(200);
      expect(beforePrepare.json().delivery).toEqual({ state: 'not_sent' });
      const notReady = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send`,
        headers: { 'idempotency-key': 'first-send' } });
      expect(notReady.json().error.code).toBe('LETTER_NOT_READY');
      expect(sendCount).toBe(0);
      const finalAttachment = await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('award.pdf', 'application/pdf', pdf) });
      expect(finalAttachment.statusCode).toBe(200);
      await contacts.upsert({
        id: contactId, universityId, kind: 'international_admissions',
        email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: false,
      });
      const unverifiedPrepare = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/prepare` });
      expect(unverifiedPrepare.json().error.code).toBe('UNIVERSITY_EMAIL_UNAVAILABLE');
      await contacts.upsert({
        id: contactId, universityId, kind: 'international_admissions',
        email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
      });
      const prepared = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/prepare` });
      expect(prepared.statusCode, prepared.body).toBe(200);
      expect(prepared.json().letter.status).toBe('ready_to_send');
      expect((await app.inject({ method: 'POST', url: attachmentsUrl,
        ...multipartFile('late.pdf', 'application/pdf', pdf) })).json().error.code).toBe('LETTER_NOT_EDITABLE');
      const missingKey = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send` });
      expect(missingKey.statusCode).toBe(400);
      const overrideRecipient = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send`,
        headers: { 'idempotency-key': 'first-send' }, payload: { recipientEmail: 'attacker@example.com' } });
      expect(overrideRecipient.statusCode).toBe(400);
      await contacts.upsert({
        id: contactId, universityId, kind: 'international_admissions',
        email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: false,
      });
      const unverifiedSend = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send`,
        headers: { 'idempotency-key': 'first-send' } });
      expect(unverifiedSend.json().error.code).toBe('UNIVERSITY_EMAIL_UNAVAILABLE');
      expect(sendCount).toBe(0);
      await contacts.upsert({
        id: contactId, universityId, kind: 'international_admissions',
        email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
        sourceStatus: 'official', verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
      });
      const sent = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send`,
        headers: { 'idempotency-key': 'first-send' } });
      expect(sent.statusCode, sent.body).toBe(200);
      expect(sent.json()).toMatchObject({ letter: { status: 'sent', recipientEmail: 'admissions@example.edu' },
        delivery: { state: 'accepted', providerMessageId: '<smtp-1@example.test>' } });
      expect(sentMessages[0]).toEqual({ to: 'admissions@example.edu', replyTo: 'alex@example.com',
        subject: 'My edited subject', body: 'My edited final text',
        attachments: [{ filename: 'award.pdf', bytes: pdf }] });
      const sentPlan = await app.inject({ method: 'GET', url: planUrl });
      expect(sentPlan.statusCode, sentPlan.body).toBe(200);
      expect(sentPlan.json().roadmap.items.find((item: { id: string }) => item.id === emailKey))
        .toMatchObject({ status: 'done', letter: { universityId,
          recipientEmail: 'admissions@example.edu', body: 'My edited final text' } });
      expect(sentPlan.json().roadmap.items.find((item: { id: string }) =>
        item.id === `school:${otherUniversityId}:email`).status).toBe('pending');
      expect(sentPlan.json().roadmap.progress.done).toBe(savedPlan.roadmap.progress.done + 1);
      expect(sentPlan.json().roadmap.nextActionId).toBe(savedPlan.roadmap.nextActionId);
      const manualReset = await app.inject({ method: 'PATCH',
        url: `/api/roadmaps/${savedPlan.roadmap.id}/items/${encodeURIComponent(emailKey)}`,
        payload: { status: 'pending' } });
      expect(manualReset.statusCode).toBe(409);
      const replay = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send`,
        headers: { 'idempotency-key': 'first-send' } });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(sent.json());
      expect(sendCount).toBe(1);
      expect(await client.letterSendAttempt.count({ where: { letterId, status: 'accepted' } })).toBe(1);
      const anotherKey = await app.inject({ method: 'POST', url: `/api/letters/${letterId}/send`,
        headers: { 'idempotency-key': 'different-key' } });
      expect(anotherKey.json().error.code).toBe('LETTER_ALREADY_SENT');
      const sentDetail = await app.inject({ method: 'GET', url: `/api/letters/${letterId}` });
      expect(sentDetail.json()).toMatchObject({
        letter: { status: 'sent', subject: 'My edited subject', body: 'My edited final text' },
        delivery: { state: 'accepted', providerMessageId: '<smtp-1@example.test>' },
      });
      expect(sentDetail.json().attachments).toEqual([finalAttachment.json().attachment]);
      expect(sentDetail.body).not.toContain('storageKey');

      const secondId = secondLetter.json().letter.id as string;
      const secondContent = await app.inject({ method: 'PUT', url: `/api/letters/${secondId}/content`,
        payload: { sourceVariantId: secondDrafts.json().variants[1].id,
          subject: 'Second final subject', body: 'Second final body' } });
      expect(secondContent.statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/api/letters/${secondId}/prepare` })).statusCode).toBe(200);
      let releaseSend!: () => void;
      let markStarted!: () => void;
      sendGate = new Promise<void>((resolve) => { releaseSend = resolve; });
      const startedSend = new Promise<void>((resolve) => { markStarted = resolve; });
      onSendStarted = markStarted;
      const pendingSend = app.inject({ method: 'POST', url: `/api/letters/${secondId}/send`,
        headers: { 'idempotency-key': 'parallel-key' } });
      await startedSend;
      const sameWhileSending = await app.inject({ method: 'POST', url: `/api/letters/${secondId}/send`,
        headers: { 'idempotency-key': 'parallel-key' } });
      expect(sameWhileSending.json().error.code).toBe('LETTER_SEND_IN_PROGRESS');
      const differentWhileSending = await app.inject({ method: 'POST', url: `/api/letters/${secondId}/send`,
        headers: { 'idempotency-key': 'another-parallel-key' } });
      expect(differentWhileSending.json().error.code).toBe('LETTER_SEND_IN_PROGRESS');
      releaseSend();
      expect((await pendingSend).statusCode).toBe(200);
      sendGate = null;
      onSendStarted = null;
      expect(sendCount).toBe(2);
      expect(await client.letterSendAttempt.count({ where: { letterId: secondId, status: 'accepted' } }))
        .toBe(1);

      const failedLetter = await app.inject({ method: 'POST', url: createUrl, payload: createBody });
      const failedId = failedLetter.json().letter.id as string;
      const failedDrafts = await app.inject({ method: 'POST', url: `/api/letters/${failedId}/drafts`, payload: {} });
      expect(failedDrafts.statusCode).toBe(200);
      expect((await app.inject({ method: 'PUT', url: `/api/letters/${failedId}/content`, payload: {
        sourceVariantId: failedDrafts.json().variants[0].id, subject: 'Failure test', body: 'Failure test body',
      } })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: `/api/letters/${failedId}/prepare` })).statusCode).toBe(200);
      sendFailure = new Error('private SMTP diagnostic');
      const failedSend = await app.inject({ method: 'POST', url: `/api/letters/${failedId}/send`,
        headers: { 'idempotency-key': 'ambiguous-key' } });
      expect(failedSend.statusCode).toBe(502);
      expect(failedSend.json().error.code).toBe('MAIL_SEND_FAILED');
      expect(failedSend.body).not.toContain('private SMTP diagnostic');
      expect((await app.inject({ method: 'GET', url: `/api/letters/${failedId}` })).json()).toMatchObject({
        letter: { status: 'failed' }, delivery: { state: 'ambiguous', errorCode: 'MAIL_SEND_FAILED' },
      });
      const failedReplay = await app.inject({ method: 'POST', url: `/api/letters/${failedId}/send`,
        headers: { 'idempotency-key': 'ambiguous-key' } });
      expect(failedReplay.statusCode).toBe(502);
      expect(sendCount).toBe(3);
      expect(await client.letterSendAttempt.count({ where: { letterId: failedId, status: 'ambiguous' } }))
        .toBe(1);
      const safeLogs = logs.join('');
      for (const privateValue of ['private SMTP diagnostic', 'My edited final text',
        'private certificate', 'alex@example.com', 'admissions@example.edu']) {
        expect(safeLogs).not.toContain(privateValue);
      }

      const makeSelectedDraft = async (body: string) => {
        const createdLetter = await app.inject({ method: 'POST', url: createUrl, payload: createBody });
        expect(createdLetter.statusCode, createdLetter.body).toBe(200);
        const id = createdLetter.json().letter.id as string;
        const drafts = await app.inject({ method: 'POST', url: `/api/letters/${id}/drafts`, payload: {} });
        expect(drafts.statusCode, drafts.body).toBe(200);
        const variantId = drafts.json().variants[0].id as string;
        const selected = await app.inject({ method: 'PUT', url: `/api/letters/${id}/content`,
          payload: { sourceVariantId: variantId, subject: 'Current inquiry', body } });
        expect(selected.statusCode, selected.body).toBe(200);
        return { id, variantId };
      };
      const pendingPlan = await plans.saveGenerated({
        profile, engineVersion: 'letter-test', recommendations: [],
        selectedUniversityIds: [universityId], ...generatedPlan,
        promptVersions: { diagnosis: 'test', recommendationExplanation: 'test', roadmap: 'test' },
      });
      expect(pendingPlan.roadmap.items.find((item) => item.id === emailKey)?.status).toBe('pending');
      const staleUniversityDraft = await makeSelectedDraft('University-bound draft');
      expect((await app.inject({ method: 'GET', url: planUrl })).json().roadmap.items
        .find((item: { id: string }) => item.id === emailKey).letter.body).toBe('University-bound draft');
      await client.university.update({ where: { id: universityId }, data: { name: 'Renamed University' } });
      expect((await app.inject({ method: 'GET', url: planUrl })).json().roadmap.items
        .find((item: { id: string }) => item.id === emailKey).letter.body).toBe('');
      const staleSelection = await app.inject({ method: 'PUT',
        url: `/api/letters/${staleUniversityDraft.id}/content`, payload: {
          sourceVariantId: staleUniversityDraft.variantId, subject: 'Old wording', body: 'Old wording',
        } });
      expect(staleSelection.statusCode).toBe(409);
      expect((await app.inject({ method: 'POST',
        url: `/api/letters/${staleUniversityDraft.id}/prepare` })).statusCode).toBe(409);
      expect((await letters.findById(staleUniversityDraft.id))?.status).toBe('superseded');
      await client.university.update({ where: { id: universityId }, data: { name: 'Test University' } });
      const staleProfileDraft = await makeSelectedDraft('Profile-bound draft');
      const changedProfile = { ...profile, annualBudgetUsd: profile.annualBudgetUsd + 1000 };
      const changedPlan = buildRoadmap(changedProfile, [{ university, requirements: [],
        admissionsContact: { email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
          sourceStatus: 'official' } }]);
      await plans.saveGenerated({
        profile: changedProfile, engineVersion: 'letter-test', recommendations: [],
        selectedUniversityIds: [universityId], ...changedPlan,
        promptVersions: { diagnosis: 'test', recommendationExplanation: 'test', roadmap: 'test' },
      });
      expect((await letters.findById(staleProfileDraft.id))?.status).toBe('superseded');
      expect((await app.inject({ method: 'GET', url: planUrl })).json().roadmap.items
        .find((item: { id: string }) => item.id === emailKey).letter.body).toBe('');
    } finally {
      await app.close();
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.universityContact.deleteMany({ where: { id: contactId } });
      await client.universityContact.deleteMany({ where: { id: otherContactId } });
      await client.university.deleteMany({ where: { id: universityId } });
      await client.university.deleteMany({ where: { id: otherUniversityId } });
      await client.$disconnect();
      await rm(uploadDir, { recursive: true, force: true });
    }
  }, 40_000);
});
