import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { UniversityProviderError, type UniversityProvider } from '../../src/application/ports/university-provider.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';
import { DemoAdmissionRequirementProvider } from '../../src/infrastructure/demo/admission-requirement-provider.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';

describe('POST /api/comparison', () => {
  it('compares two or three selected demo universities with source statuses', async () => {
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(),
    });
    try {
      for (const ids of [
        ['demo-redwood-state', 'demo-gulf-metropolitan'],
        ['demo-redwood-state', 'demo-gulf-metropolitan', 'demo-lakeside-tech'],
      ]) {
        const response = await app.inject({
          method: 'POST', url: '/api/comparison', payload: { profile: canonicalDemoProfile, universityIds: ids },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.engineVersion).toBe('1.0.0');
        expect(body.comparisons.map((item: { university: { id: string } }) => item.university.id)).toEqual(ids);
        expect(body.comparisons[0]).toMatchObject({
          recommendation: { fitScore: expect.any(Number), components: expect.any(Array) },
          requirementsStatus: 'reported',
          requirements: [
            { sourceStatus: 'demo', kind: 'application_deadline' },
            { sourceStatus: 'demo', kind: 'english' },
          ],
        });
      }
    } finally {
      await app.close();
    }
  });

  it('rejects one, four, or duplicate IDs before calling the provider', async () => {
    const getById = vi.fn<UniversityProvider['getById']>();
    const app = buildApp({}, {
      universityProvider: { search: async () => [], getById },
      requirementProvider: { listByUniversityIds: async () => [] },
    });
    try {
      for (const ids of [['one'], ['one', 'two', 'three', 'four'], ['one', 'one']]) {
        const response = await app.inject({
          method: 'POST', url: '/api/comparison', payload: { profile: canonicalDemoProfile, universityIds: ids },
        });
        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: { code: 'VALIDATION', message: 'Invalid request', details: [] } });
      }
      expect(getById).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('returns a safe not-found error if a selected university is missing', async () => {
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(),
    });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/comparison',
        payload: { profile: canonicalDemoProfile, universityIds: ['demo-redwood-state', 'missing'] },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } });
    } finally {
      await app.close();
    }
  });

  it('maps provider failures to a safe upstream error', async () => {
    const app = buildApp({}, {
      universityProvider: {
        search: async () => [],
        getById: async () => { throw new UniversityProviderError('UNAVAILABLE'); },
      },
      requirementProvider: { listByUniversityIds: async () => [] },
    });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/comparison',
        payload: { profile: canonicalDemoProfile, universityIds: ['one', 'two'] },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: { code: 'EXTERNAL_UNAVAILABLE', message: 'University data unavailable', details: [] },
      });
      expect(response.body).not.toContain('stack');
    } finally {
      await app.close();
    }
  });
});
