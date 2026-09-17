import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { DatabaseUnavailableError, type PlanRepository } from '../../src/application/ports/plan-repository.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';
import { DemoAdmissionRequirementProvider } from '../../src/infrastructure/demo/admission-requirement-provider.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';

function repository(): PlanRepository {
  return {
    saveGenerated: async () => { throw new DatabaseUnavailableError(); },
    findCurrent: async () => null,
    updateItemStatus: async () => null,
  };
}

describe('persistence HTTP errors', () => {
  it('validates identifiers and statuses before accessing the repository', async () => {
    const app = buildApp({}, { planRepository: repository() });
    try {
      const invalidId = await app.inject({ method: 'GET', url: '/api/plan/not-a-uuid' });
      expect(invalidId.statusCode).toBe(400);
      const invalidStatus = await app.inject({
        method: 'PATCH', url: `/api/roadmaps/${randomUUID()}/items/research%3Aprograms`,
        payload: { status: 'finished' },
      });
      expect(invalidStatus.statusCode).toBe(400);
      const missing = await app.inject({ method: 'GET', url: `/api/plan/${randomUUID()}` });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('NOT_FOUND');
      const missingProfileId = await app.inject({
        method: 'POST', url: '/api/plan/recalculate', payload: { profile: canonicalDemoProfile },
      });
      expect(missingProfileId.statusCode).toBe(400);
      const missingPlan = await app.inject({
        method: 'POST', url: '/api/plan/recalculate',
        payload: { profile: { ...canonicalDemoProfile, id: randomUUID() } },
      });
      expect(missingPlan.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('maps database errors to a safe 503 response', async () => {
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(),
      planRepository: repository(), aiProvider: null,
    });
    try {
      const response = await app.inject({
        method: 'PUT', url: '/api/profile', payload: { profile: canonicalDemoProfile },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', details: [] },
      });
      expect(response.body).not.toContain('stack');
    } finally {
      await app.close();
    }
  });
});
