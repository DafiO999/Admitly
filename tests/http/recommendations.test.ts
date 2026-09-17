import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import { UniversityProviderError, type UniversityProvider } from '../../src/application/ports/university-provider.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';

describe('POST /api/recommendations', () => {
  it('returns ranked normalized universities and the engine version', async () => {
    const app = buildApp({}, { universityProvider: new DemoUniversityProvider() });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations', payload: { profile: canonicalDemoProfile },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.engineVersion).toBe('1.0.0');
      expect(body.recommendations.length).toBeGreaterThanOrEqual(3);
      expect(body.recommendations[0]).toMatchObject({
        universityId: expect.any(String), university: { provider: 'demo' },
        fitScore: expect.any(Number), components: expect.any(Array),
        reasonCodes: expect.any(Array), concerns: expect.any(Array),
      });
      expect(body.recommendations[0].fitScore).toBeGreaterThanOrEqual(body.recommendations[1].fitScore);
      expect(response.body).not.toContain('admissionProbability');
    } finally {
      await app.close();
    }
  });

  it('returns a safe validation error before querying a provider', async () => {
    const search = vi.fn<UniversityProvider['search']>();
    const provider: UniversityProvider = { search, getById: async () => null };
    const app = buildApp({}, { universityProvider: provider });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations',
        payload: { profile: { ...canonicalDemoProfile, gpaValue: 9, secret: 'private-key' } },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { code: 'VALIDATION', message: 'Invalid request', details: [] } });
      expect(search).not.toHaveBeenCalled();
      expect(response.body).not.toContain('private-key');
    } finally {
      await app.close();
    }
  });

  it('returns an empty recommendation list when no program matches', async () => {
    const app = buildApp({}, { universityProvider: new DemoUniversityProvider() });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations',
        payload: { profile: { ...canonicalDemoProfile, targetField: 'other' } },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ engineVersion: '1.0.0', recommendations: [] });
    } finally {
      await app.close();
    }
  });

  it('maps typed provider failures to a safe upstream error', async () => {
    const provider: UniversityProvider = {
      search: async () => { throw new UniversityProviderError('UNAVAILABLE'); },
      getById: async () => null,
    };
    const app = buildApp({}, { universityProvider: provider });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations', payload: { profile: canonicalDemoProfile },
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

  it('rejects non-normalized provider data as an upstream failure', async () => {
    const provider: UniversityProvider = {
      search: async () => [{ id: 'bad', provider: 'demo', name: 'Bad data' } as never],
      getById: async () => null,
    };
    const app = buildApp({}, { universityProvider: provider });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations', payload: { profile: canonicalDemoProfile },
      });
      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: { code: 'EXTERNAL_UNAVAILABLE', message: 'University data unavailable', details: [] },
      });
    } finally {
      await app.close();
    }
  });
});
