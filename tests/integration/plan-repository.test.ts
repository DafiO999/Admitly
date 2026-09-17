import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createProfileHash } from '../../src/domain/profile/hash.js';
import { rankUniversities } from '../../src/domain/recommendation/engine.js';
import { buildRoadmap } from '../../src/domain/roadmap/builder.js';
import { RECOMMENDATION_ENGINE_VERSION } from '../../src/domain/versions.js';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { PrismaPlanRepository } from '../../src/infrastructure/db/repositories/prisma-plan-repository.js';
import { canonicalDemoProfile, demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { DemoAdmissionRequirementProvider } from '../../src/infrastructure/demo/admission-requirement-provider.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';
import { getTestDatabaseUrl } from './test-database-url.js';

const databaseUrl = getTestDatabaseUrl(process.env);

function generatedPlan(profileId: string) {
  const profile = { ...canonicalDemoProfile, id: profileId };
  const recommendations = rankUniversities(profile, demoUniversities);
  const selectedUniversityIds = recommendations.slice(0, 2).map((recommendation) => recommendation.universityId);
  const schools = selectedUniversityIds.map((id) => ({
    university: demoUniversities.find((university) => university.id === id)!,
    requirements: demoRequirements.filter((requirement) => requirement.universityId === id),
  }));
  return {
    profile, engineVersion: RECOMMENDATION_ENGINE_VERSION, recommendations,
    ...buildRoadmap(profile, schools), selectedUniversityIds,
  };
}

describe('Prisma plan repository', () => {
  it.skipIf(databaseUrl === null)('saves and retrieves a coherent plan and updates next action atomically', async () => {
    const client = createPrismaClient(databaseUrl!);
    const repository = new PrismaPlanRepository(client);
    const profileId = randomUUID();
    try {
      const input = generatedPlan(profileId);
      const saved = await repository.saveGenerated(input);
      expect(saved.profile.id).toBe(profileId);
      expect(saved.profileHash).toBe(createProfileHash(input.profile));
      expect(saved.roadmap.nextActionId).toBe('research:programs');
      const loaded = await repository.findCurrent(profileId);
      expect(loaded).toEqual(saved);
      const stored = await client.profile.findUnique({
        where: { id: profileId },
        include: { currentRoadmap: { include: { recommendationRun: true, items: true } } },
      });
      expect(stored?.currentRoadmapId).toBe(saved.roadmap.id);
      expect(stored?.currentRoadmap?.recommendationRunId).toBe(saved.recommendationRun.id);
      expect(stored?.currentRoadmap?.items).toHaveLength(saved.roadmap.items.length);
      const updated = await repository.updateItemStatus(saved.roadmap.id, 'research:programs', 'done');
      expect(updated?.nextActionId).not.toBe('research:programs');
      expect(updated?.items.filter((item) => item.isNextAction)).toHaveLength(1);
      expect(updated?.items.find((item) => item.id === 'research:programs')?.status).toBe('done');
      expect((await repository.findCurrent(profileId))?.roadmap).toEqual(updated);
    } finally {
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
    }
  });

  it.skipIf(databaseUrl === null)('enforces foreign keys and unique roadmap item keys', async () => {
    const client = createPrismaClient(databaseUrl!);
    const repository = new PrismaPlanRepository(client);
    const profileId = randomUUID();
    try {
      await expect(client.recommendationRun.create({ data: {
        profileId, profileHash: 'test', engineVersion: 'test', result: {},
      } })).rejects.toThrow();
      const saved = await repository.saveGenerated(generatedPlan(profileId));
      await expect(client.roadmapItem.create({ data: {
        roadmapId: saved.roadmap.id, key: 'research:programs', position: 100,
        title: 'Duplicate', category: 'research', priority: 1, dependsOnIds: [], status: 'pending',
      } })).rejects.toThrow();
    } finally {
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
    }
  });
});

describe('persistence API', () => {
  it.skipIf(databaseUrl === null)('creates, retrieves, and updates the current plan', async () => {
    const client = createPrismaClient(databaseUrl!);
    const profileId = randomUUID();
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(),
      planRepository: new PrismaPlanRepository(client), aiProvider: null,
    });
    try {
      const profile = { ...canonicalDemoProfile, id: profileId };
      const saved = await app.inject({ method: 'PUT', url: '/api/profile', payload: { profile } });
      expect(saved.statusCode).toBe(200);
      expect(saved.json().profile.id).toBe(profileId);
      expect(saved.json().recommendationRun.recommendations.length).toBeGreaterThanOrEqual(3);
      const roadmapId = saved.json().roadmap.id;
      const loaded = await app.inject({ method: 'GET', url: `/api/plan/${profileId}` });
      expect(loaded.statusCode).toBe(200);
      expect(loaded.json()).toEqual(saved.json());
      const updated = await app.inject({
        method: 'PATCH', url: `/api/roadmaps/${roadmapId}/items/research%3Aprograms`,
        payload: { status: 'done' },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().roadmap.nextActionId).not.toBe('research:programs');
      expect(updated.json().roadmap.items.find((item: { id: string }) => item.id === 'research:programs').status)
        .toBe('done');
      const second = await app.inject({
        method: 'PUT', url: '/api/profile',
        payload: { profile: { ...profile, annualBudgetUsd: profile.annualBudgetUsd + 1000 } },
      });
      expect(second.statusCode).toBe(200);
      expect(second.json().roadmap.id).not.toBe(roadmapId);
      expect(second.json().profileHash).not.toBe(saved.json().profileHash);
      expect(second.json().roadmap.items.find((item: { id: string }) => item.id === 'research:programs').status)
        .toBe('pending');
      const latest = await app.inject({ method: 'GET', url: `/api/plan/${profileId}` });
      expect(latest.json()).toEqual(second.json());
      const stale = await app.inject({
        method: 'PATCH', url: `/api/roadmaps/${roadmapId}/items/research%3Aprograms`, payload: { status: 'done' },
      });
      expect(stale.statusCode).toBe(404);
    } finally {
      await app.close();
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
    }
  });

  it.skipIf(databaseUrl === null)('persists a generic plan when no universities match', async () => {
    const client = createPrismaClient(databaseUrl!);
    const profileId = randomUUID();
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(),
      planRepository: new PrismaPlanRepository(client), aiProvider: null,
    });
    try {
      const response = await app.inject({
        method: 'PUT', url: '/api/profile',
        payload: { profile: { ...canonicalDemoProfile, id: profileId, targetField: 'other' } },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().recommendationRun.recommendations).toEqual([]);
      expect(response.json().roadmap.selectedUniversityIds).toEqual([]);
      expect(response.json().roadmap.nextActionId).toBe('research:programs');
      const loaded = await app.inject({ method: 'GET', url: `/api/plan/${profileId}` });
      expect(loaded.json()).toEqual(response.json());
    } finally {
      await app.close();
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
    }
  });
});
