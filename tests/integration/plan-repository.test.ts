import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createProfileHash } from '../../src/domain/profile/hash.js';
import { PlanConflictError } from '../../src/application/ports/plan-repository.js';
import { UniversityProviderError } from '../../src/application/ports/university-provider.js';
import { rankUniversities } from '../../src/domain/recommendation/engine.js';
import { buildRoadmap } from '../../src/domain/roadmap/builder.js';
import {
  DIAGNOSIS_PROMPT_VERSION, RECOMMENDATION_ENGINE_VERSION,
  RECOMMENDATION_EXPLANATION_PROMPT_VERSION, ROADMAP_PROMPT_VERSION,
} from '../../src/domain/versions.js';
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
    promptVersions: {
      diagnosis: DIAGNOSIS_PROMPT_VERSION, recommendationExplanation: RECOMMENDATION_EXPLANATION_PROMPT_VERSION,
      roadmap: ROADMAP_PROMPT_VERSION,
    },
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

  it.skipIf(databaseUrl === null)('rejects a stale recalculation without changing the current plan', async () => {
    const client = createPrismaClient(databaseUrl!);
    const repository = new PrismaPlanRepository(client);
    const profileId = randomUUID();
    try {
      const first = await repository.saveGenerated(generatedPlan(profileId));
      const second = await repository.saveGenerated({
        ...generatedPlan(profileId), expectedCurrentRoadmapId: first.roadmap.id,
      });
      await expect(repository.saveGenerated({
        ...generatedPlan(profileId), profile: { ...canonicalDemoProfile, id: profileId, annualBudgetUsd: 5000 },
        expectedCurrentRoadmapId: first.roadmap.id,
      })).rejects.toBeInstanceOf(PlanConflictError);
      expect(await repository.findCurrent(profileId)).toEqual(second);
    } finally {
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
    }
  });

  it.skipIf(databaseUrl === null)('rejects a recalculation based on outdated task statuses', async () => {
    const client = createPrismaClient(databaseUrl!);
    const repository = new PrismaPlanRepository(client);
    const profileId = randomUUID();
    try {
      const first = await repository.saveGenerated(generatedPlan(profileId));
      const expectedCurrentRoadmapStatuses = first.roadmap.items.map((item) => ({
        key: item.id, status: item.status,
      }));
      await repository.updateItemStatus(first.roadmap.id, 'research:programs', 'done');
      await expect(repository.saveGenerated({
        ...generatedPlan(profileId), expectedCurrentRoadmapId: first.roadmap.id,
        expectedCurrentRoadmapStatuses,
      })).rejects.toBeInstanceOf(PlanConflictError);
      const current = await repository.findCurrent(profileId);
      expect(current?.roadmap.id).toBe(first.roadmap.id);
      expect(current?.roadmap.items.find((item) => item.id === 'research:programs')?.status).toBe('done');
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

  it.skipIf(databaseUrl === null)('recalculates budget, field, and SAT without retaining stale explanations', async () => {
    const client = createPrismaClient(databaseUrl!);
    const profileId = randomUUID();
    let failRequirements = false;
    const demoRequirementProvider = new DemoAdmissionRequirementProvider();
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: { listByUniversityIds: async (ids) => {
        if (failRequirements) throw new UniversityProviderError('UNAVAILABLE');
        return demoRequirementProvider.listByUniversityIds(ids);
      } },
      planRepository: new PrismaPlanRepository(client), aiProvider: null,
    });
    const profile = { ...canonicalDemoProfile, id: profileId };
    const itemStatus = (plan: { roadmap: { items: { id: string; status: string }[] } }, id: string) =>
      plan.roadmap.items.find((item) => item.id === id)?.status;
    try {
      const initialResponse = await app.inject({ method: 'PUT', url: '/api/profile', payload: { profile } });
      expect(initialResponse.statusCode).toBe(200);
      const initial = initialResponse.json();
      for (const itemId of ['research:programs', 'research:budget', 'document:academic-records']) {
        const response = await app.inject({
          method: 'PATCH', url: `/api/roadmaps/${initial.roadmap.id}/items/${encodeURIComponent(itemId)}`,
          payload: { status: 'done' },
        });
        expect(response.statusCode).toBe(200);
      }
      const withExplanation = {
        engineVersion: initial.recommendationRun.engineVersion,
        promptVersions: initial.recommendationRun.promptVersions,
        recommendations: structuredClone(initial.recommendationRun.recommendations),
      };
      withExplanation.recommendations[0].explanation = {
        summary: 'Outdated explanation', reasons: ['Old score'], concerns: [],
      };
      await client.recommendationRun.update({
        where: { id: initial.recommendationRun.id }, data: { result: withExplanation },
      });
      const budgetProfile = { ...profile, annualBudgetUsd: 60000 };
      const budgetResponse = await app.inject({
        method: 'POST', url: '/api/plan/recalculate', payload: { profile: budgetProfile },
      });
      expect(budgetResponse.statusCode).toBe(200);
      const budget = budgetResponse.json();
      expect(budget.profileHash).not.toBe(initial.profileHash);
      expect(budget.recommendationRun.id).not.toBe(initial.recommendationRun.id);
      expect(budget.roadmap.id).not.toBe(initial.roadmap.id);
      expect(budget.recommendationRun.recommendations.every((item: { explanation?: object }) => !item.explanation))
        .toBe(true);
      expect(budget.recommendationRun.promptVersions).toEqual(initial.recommendationRun.promptVersions);
      expect(budget.recommendationRun.engineVersion).toBe(RECOMMENDATION_ENGINE_VERSION);
      expect(budget.roadmap.rulesVersion).toBe(initial.roadmap.rulesVersion);
      expect(itemStatus(budget, 'document:academic-records')).toBe('done');
      expect(itemStatus(budget, 'research:budget')).toBe('pending');
      const budgetScore = (item: { components: { key: string; score: number }[] }) =>
        item.components.find((component) => component.key === 'budget')!.score;
      expect(initial.recommendationRun.recommendations.some((item: { universityId: string; components: { key: string; score: number }[] }) => {
        const updated = budget.recommendationRun.recommendations
          .find((candidate: { universityId: string }) => candidate.universityId === item.universityId);
        return updated && budgetScore(updated) > budgetScore(item);
      })).toBe(true);

      const fieldProfile = { ...budgetProfile, targetField: 'business' as const };
      const fieldResponse = await app.inject({
        method: 'POST', url: '/api/plan/recalculate', payload: { profile: fieldProfile },
      });
      expect(fieldResponse.statusCode).toBe(200);
      const field = fieldResponse.json();
      expect(field.recommendationRun.recommendations.every((item: { university: { programs: { field: string }[] } }) =>
        item.university.programs.some((program) => program.field === 'business'))).toBe(true);
      expect(field.roadmap.selectedUniversityIds).not.toEqual(budget.roadmap.selectedUniversityIds);
      expect(itemStatus(field, 'research:programs')).toBe('pending');
      expect(itemStatus(field, 'document:academic-records')).toBe('done');

      const satProfile = { ...fieldProfile, sat: { status: 'planned' as const } };
      const satResponse = await app.inject({
        method: 'POST', url: '/api/plan/recalculate', payload: { profile: satProfile },
      });
      expect(satResponse.statusCode).toBe(200);
      const sat = satResponse.json();
      expect(itemStatus(sat, 'exam:sat')).toBe('pending');
      expect(sat.recommendationRun.recommendations.some((item: { reasonCodes: string[] }) =>
        item.reasonCodes.includes('SAT_NOT_PROVIDED'))).toBe(false);
      expect(sat.recommendationRun.recommendations[0].components
        .find((component: { key: string }) => component.key === 'academic').score)
        .not.toBe(field.recommendationRun.recommendations[0].components
          .find((component: { key: string }) => component.key === 'academic').score);
      const loaded = await app.inject({ method: 'GET', url: `/api/plan/${profileId}` });
      expect(loaded.json()).toEqual(sat);
      failRequirements = true;
      const failed = await app.inject({
        method: 'POST', url: '/api/plan/recalculate',
        payload: { profile: { ...satProfile, annualBudgetUsd: 5000 } },
      });
      expect(failed.statusCode).toBe(502);
      expect((await app.inject({ method: 'GET', url: `/api/plan/${profileId}` })).json()).toEqual(sat);
    } finally {
      await app.close();
      await client.profile.deleteMany({ where: { id: profileId } });
      await client.$disconnect();
    }
  });
});
