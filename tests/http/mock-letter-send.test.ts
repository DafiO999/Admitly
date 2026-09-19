import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { LetterDraftProvider } from '../../src/application/ports/letter-draft-provider.js';
import type { PersistedPlan, PlanRepository } from '../../src/application/ports/plan-repository.js';
import { letterDraftSentenceBank } from '../../src/domain/letter/draft-guard.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { createProfileAccessToken } from '../../src/http/profile-access.js';

describe('mock letter send', () => {
  it('simulates a send without a contact, draft provider, or mail transport', async () => {
    const profileId = randomUUID();
    const accessHeaders = { 'x-admitly-access-key': createProfileAccessToken(profileId, 'admitly-local-profile-access-secret') };
    const university = demoUniversities[0]!;
    const universityId = university.id;
    let mailCalls = 0;
    const plan: PersistedPlan = {
      profile: { ...canonicalDemoProfile, id: profileId }, profileHash: 'test',
      recommendationRun: { id: randomUUID(), engineVersion: 'test', recommendations: [{
        universityId, university, fitScore: 80, components: [], reasonCodes: [], concerns: [],
      }] },
      roadmap: { id: randomUUID(), rulesVersion: 'test', items: [], nextActionId: null,
        progress: { done: 0, total: 0, percent: 0 }, selectedUniversityIds: [] },
      sourceCoverage: { official: 0, verified: 0, demo: 1, unknown: 0 },
    };
    const plans: PlanRepository = {
      findCurrent: async (id) => id === profileId ? plan : null,
      saveGenerated: async () => { throw new Error('saveGenerated must not run'); },
      updateItemStatus: async () => { throw new Error('updateItemStatus must not run'); },
      findRoadmapProfileId: async () => null,
      findLetterProfileId: async () => null,
    };
    const drafts: LetterDraftProvider = { generateLetterDrafts: async (input) => {
      const bank = letterDraftSentenceBank(input);
      const question = bank.lines.find((line) => line.startsWith('Could '))!;
      const required = [bank.lines[0]!, bank.lines[1]!, question,
        'Sincerely,', input.sender.fullName];
      return { variants: [
        { variant: 'concise', subject: bank.subjects[0]!, body: required.join('\n') },
        { variant: 'balanced', subject: bank.subjects[1]!,
          body: [bank.lines[0]!, bank.lines[1]!, bank.lines[2]!, ...required.slice(2)].join('\n') },
        { variant: 'detailed', subject: bank.subjects[2]!, body: bank.lines.join('\n') },
      ] };
    } };
    const app = buildApp({}, {
      planRepository: plans,
      letterDraftProvider: drafts,
      mailDeliveryMode: 'mock',
      mailProvider: { send: async () => { mailCalls += 1; return { providerMessageId: null }; } },
    });
    try {
      expect((await app.inject({ method: 'GET', url: '/api/letter-delivery-mode' })).json())
        .toEqual({ mode: 'mock' });
      const prepared = await app.inject({ method: 'POST', url: '/api/letters/mock-drafts', payload: {
        profileId, universityId, senderName: 'Alex Student', purpose: 'admissions_inquiry',
      }, headers: accessHeaders });
      expect(prepared.statusCode, prepared.body).toBe(200);
      expect(prepared.json().variants).toHaveLength(3);
      expect(prepared.json().variants.map((variant: { variant: string }) => variant.variant))
        .toEqual(['concise', 'balanced', 'detailed']);
      expect(prepared.json().variants.every((variant: { id: string }) =>
        /^[0-9a-f-]{36}$/.test(variant.id))).toBe(true);
      const body = { profileId, universityId, senderName: 'Alex Student',
        subject: 'Admission question', body: 'Could you tell me about the program?' };
      const result = await app.inject({ method: 'POST', url: '/api/letters/mock-send', payload: body, headers: accessHeaders });
      expect(result.statusCode, result.body).toBe(200);
      expect(result.json()).toMatchObject({ status: 'simulated', universityId,
        universityName: university.name, subject: body.subject });
      expect(result.json().simulationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(mailCalls).toBe(0);
      expect((await app.inject({ method: 'POST', url: '/api/letters/mock-send',
        payload: { ...body, subject: '' }, headers: accessHeaders })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/api/letters/mock-send',
        payload: { ...body, universityId: 'missing' }, headers: accessHeaders })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: '/api/letters/mock-send',
        payload: { ...body, profileId: randomUUID() }, headers: accessHeaders })).statusCode).toBe(401);
      const blockedRealSend = await app.inject({ method: 'POST',
        url: `/api/letters/${randomUUID()}/send`, headers: { 'idempotency-key': 'test' } });
      expect(blockedRealSend.json().error.code).toBe('MAIL_PROVIDER_UNAVAILABLE');
      expect(mailCalls).toBe(0);
    } finally { await app.close(); }
  });
});
