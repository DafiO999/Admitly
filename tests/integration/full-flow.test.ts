import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { PrismaPlanRepository } from '../../src/infrastructure/db/repositories/prisma-plan-repository.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';
import { getTestDatabaseUrl } from './test-database-url.js';
import { createProfileAccessToken } from '../../src/http/profile-access.js';

const databaseUrl = getTestDatabaseUrl(process.env);

describe('complete demo admission flow', () => {
  it.skipIf(databaseUrl === null)('diagnoses, recommends, compares, plans, persists, and recalculates', async () => {
    const previousDemoMode = process.env.DEMO_DATA_MODE;
    process.env.DEMO_DATA_MODE = 'true';
    const client = createPrismaClient(databaseUrl!);
    const profileId = randomUUID();
    const profile = { ...canonicalDemoProfile, id: profileId };
    const app = buildApp({}, { planRepository: new PrismaPlanRepository(client), aiProvider: null });
    app.addHook('onRequest', async (request) => {
      request.headers['x-admitly-access-key'] = createProfileAccessToken(profileId, 'admitly-local-profile-access-secret');
    });
    const request = async (method: 'POST' | 'PUT' | 'PATCH' | 'GET', url: string, payload?: unknown) => {
      const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      expect(response.statusCode, `${method} ${url}: ${response.body}`).toBe(200);
      return response.json();
    };
    try {
      const diagnosis = await request('POST', '/api/diagnosis', { profile });
      expect(diagnosis.mode).toBe('rules');
      expect(diagnosis.diagnosis.focusNow.length).toBeGreaterThan(0);

      const recommendations = await request('POST', '/api/recommendations', { profile });
      expect(recommendations.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(recommendations.recommendations[0].fitScore).toBeGreaterThan(0);
      const selectedIds = recommendations.recommendations.slice(0, 2)
        .map((item: { universityId: string }) => item.universityId);

      const comparison = await request('POST', '/api/comparison', { profile, universityIds: selectedIds });
      expect(comparison.comparisons.map((item: { university: { id: string } }) => item.university.id))
        .toEqual(selectedIds);
      expect(comparison.comparisons.every((item: { requirementsStatus: string }) =>
        item.requirementsStatus === 'reported')).toBe(true);

      const roadmap = await request('POST', '/api/roadmap', { profile, selectedUniversityIds: selectedIds });
      expect(roadmap.mode).toBe('rules');
      expect(roadmap.sourceCoverage.demo).toBeGreaterThan(0);
      expect(roadmap.roadmap.items.filter((item: { isNextAction: boolean }) => item.isNextAction))
        .toHaveLength(1);

      const saved = await request('PUT', '/api/profile', { profile });
      expect(saved.profile.id).toBe(profileId);
      expect(saved.recommendationRun.recommendations).toEqual(recommendations.recommendations);
      expect(saved.roadmap.selectedUniversityIds).toEqual(
        recommendations.recommendations.slice(0, 3).map((item: { universityId: string }) => item.universityId),
      );
      expect(await request('GET', `/api/plan/${profileId}`)).toEqual(saved);

      const completed = await request('PATCH',
        `/api/roadmaps/${saved.roadmap.id}/items/research%3Aprograms`, { status: 'done' });
      expect(completed.roadmap.items.find((item: { id: string }) => item.id === 'research:programs').status)
        .toBe('done');

      const revisedProfile = { ...profile, annualBudgetUsd: 60000 };
      const revised = await request('POST', '/api/plan/recalculate', { profile: revisedProfile });
      expect(revised.profileHash).not.toBe(saved.profileHash);
      expect(revised.roadmap.id).not.toBe(saved.roadmap.id);
      expect(revised.roadmap.items.find((item: { id: string }) => item.id === 'research:programs').status)
        .toBe('done');
      const budgetScore = (item: { components: { key: string; score: number }[] }) =>
        item.components.find((component) => component.key === 'budget')!.score;
      expect(revised.recommendationRun.recommendations.some((item: { universityId: string; components: { key: string; score: number }[] }) => {
        const old = saved.recommendationRun.recommendations.find(
          (candidate: { universityId: string }) => candidate.universityId === item.universityId,
        );
        return old && budgetScore(item) > budgetScore(old);
      })).toBe(true);
      expect(await request('GET', `/api/plan/${profileId}`)).toEqual(revised);
    } finally {
      await app.close();
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
      if (previousDemoMode === undefined) delete process.env.DEMO_DATA_MODE;
      else process.env.DEMO_DATA_MODE = previousDemoMode;
    }
  });
});
