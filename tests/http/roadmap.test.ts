import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AiProvider } from '../../src/application/ports/ai-provider.js';
import { UniversityProviderError, type UniversityProvider } from '../../src/application/ports/university-provider.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { DemoAdmissionRequirementProvider } from '../../src/infrastructure/demo/admission-requirement-provider.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';

const selectedUniversityIds = ['demo-redwood-state', 'demo-gulf-metropolitan'];
const payload = { profile: canonicalDemoProfile, selectedUniversityIds };

function aiProvider(rewriteRoadmap: AiProvider['rewriteRoadmap']): AiProvider {
  return {
    enhanceDiagnosis: async (diagnosis) => diagnosis,
    explainRecommendation: async () => ({ summary: 'Example', reasons: [], concerns: [] }),
    rewriteRoadmap,
  };
}

describe('POST /api/roadmap', () => {
  it('builds sourced tasks and a next action without Gemini', async () => {
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(), aiProvider: null,
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/roadmap', payload });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        mode: 'rules', sourceCoverage: { official: 0, verified: 0, demo: 4, unknown: 0 },
        roadmap: { rulesVersion: '1.1.0', nextActionId: 'academic:grade-11-focus:computer_science' },
      });
      expect(response.json().roadmap.items.filter((item: { isNextAction: boolean }) => item.isNextAction))
        .toHaveLength(1);
      expect(response.json().roadmap.items.filter((item: { dueDate?: string }) => item.dueDate))
        .toHaveLength(2);
    } finally {
      await app.close();
    }
  });

  it('uses Gemini only for requested generic wording and preserves task facts', async () => {
    const rewriteRoadmap = vi.fn<AiProvider['rewriteRoadmap']>().mockImplementation(async (items) =>
      items.map((item) => item.id === 'research:programs'
        ? { ...item, title: 'Explore selected bachelor programs' } : item));
    const provider = new DemoUniversityProvider();
    const requirements = new DemoAdmissionRequirementProvider();
    const app = buildApp({}, {
      universityProvider: provider, requirementProvider: requirements, aiProvider: aiProvider(rewriteRoadmap),
    });
    const rulesApp = buildApp({}, {
      universityProvider: provider, requirementProvider: requirements, aiProvider: null,
    });
    try {
      const plain = await app.inject({ method: 'POST', url: '/api/roadmap', payload });
      expect(plain.json().mode).toBe('rules');
      expect(rewriteRoadmap).not.toHaveBeenCalled();
      const enhanced = await app.inject({ method: 'POST', url: '/api/roadmap', payload: { ...payload, enhanceWithAi: true } });
      const rules = await rulesApp.inject({ method: 'POST', url: '/api/roadmap', payload });
      expect(enhanced.statusCode).toBe(200);
      expect(enhanced.json()).toMatchObject({ mode: 'gemini', promptVersion: '1.0.0' });
      expect(enhanced.json().roadmap.items[0].title).toBe('Explore selected bachelor programs');
      expect(rewriteRoadmap).toHaveBeenCalledOnce();
      expect(rewriteRoadmap.mock.calls[0]![0].every((item) =>
        !item.id.includes(':deadline:') && !item.id.includes(':requirement:'))).toBe(true);
      const normalize = (body: ReturnType<typeof JSON.parse>) => ({
        ...body, mode: 'rules', promptVersion: undefined,
        roadmap: { ...body.roadmap, items: body.roadmap.items.map((item: { title: string }) => ({
          ...item, title: item.title === 'Explore selected bachelor programs'
            ? 'Review selected bachelor programs' : item.title,
        })) },
      });
      expect(normalize(enhanced.json())).toEqual({ ...rules.json(), promptVersion: undefined });
    } finally {
      await app.close();
      await rulesApp.close();
    }
  });

  it('falls back on malformed, unsupported, or failed AI output', async () => {
    const variants: AiProvider['rewriteRoadmap'][] = [
      async (items) => items.slice(1),
      async (items) => items.map((item) => item.id === 'research:programs'
        ? { ...item, title: 'The official deadline is January 1, 2028.' } : item),
      async (items) => items.map((item) => item.id === 'research:programs'
        ? { ...item, title: 'All selected bachelor programs are accredited' } : item),
      async (items) => items.map((item) => ({ ...item, sourceStatus: 'verified' })) as never,
      async () => { throw new Error('private-key'); },
    ];
    for (const rewriteRoadmap of variants) {
      const app = buildApp({}, {
        universityProvider: new DemoUniversityProvider(),
        requirementProvider: new DemoAdmissionRequirementProvider(),
        aiProvider: aiProvider(rewriteRoadmap),
      });
      try {
        const response = await app.inject({
          method: 'POST', url: '/api/roadmap', payload: { ...payload, enhanceWithAi: true },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().mode).toBe('rules');
        expect(response.body).not.toContain('private-key');
      } finally {
        await app.close();
      }
    }
  });

  it('validates selection and returns safe provider errors', async () => {
    const getById = vi.fn<UniversityProvider['getById']>();
    const app = buildApp({}, {
      universityProvider: { search: async () => [], getById },
      requirementProvider: { listByUniversityIds: async () => [] }, aiProvider: null,
    });
    try {
      for (const ids of [[], ['same', 'same'], ['a', 'b', 'c', 'd']]) {
        const response = await app.inject({
          method: 'POST', url: '/api/roadmap', payload: { ...payload, selectedUniversityIds: ids },
        });
        expect(response.statusCode).toBe(400);
      }
      expect(getById).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
    const missing = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(), aiProvider: null,
    });
    try {
      const response = await missing.inject({
        method: 'POST', url: '/api/roadmap',
        payload: { ...payload, selectedUniversityIds: ['missing'] },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await missing.close();
    }
    const failing = buildApp({}, {
      universityProvider: {
        search: async () => [],
        getById: async () => { throw new UniversityProviderError('UNAVAILABLE'); },
      },
      requirementProvider: { listByUniversityIds: async () => [] }, aiProvider: null,
    });
    try {
      const response = await failing.inject({ method: 'POST', url: '/api/roadmap', payload });
      expect(response.statusCode).toBe(502);
      expect(response.json().error.code).toBe('EXTERNAL_UNAVAILABLE');
    } finally {
      await failing.close();
    }
  });

  it('treats missing requirement records as unknown', async () => {
    const app = buildApp({}, {
      universityProvider: {
        search: async () => demoUniversities,
        getById: async (id) => demoUniversities.find((university) => university.id === id) ?? null,
      },
      requirementProvider: { listByUniversityIds: async () => [] }, aiProvider: null,
    });
    try {
      const response = await app.inject({ method: 'POST', url: '/api/roadmap', payload });
      expect(response.statusCode).toBe(200);
      expect(response.json().sourceCoverage.unknown).toBe(2);
      expect(response.json().roadmap.items.some((item: { dueDate?: string }) => item.dueDate)).toBe(false);
    } finally {
      await app.close();
    }
  });

  it('rejects a selected school without the target program', async () => {
    const app = buildApp({}, {
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: new DemoAdmissionRequirementProvider(), aiProvider: null,
    });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/roadmap',
        payload: { ...payload, selectedUniversityIds: ['demo-prairie-college'] },
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('VALIDATION');
    } finally {
      await app.close();
    }
  });
});
