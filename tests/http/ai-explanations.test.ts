import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { AiProvider } from '../../src/application/ports/ai-provider.js';
import { diagnoseProfile } from '../../src/domain/diagnosis/service.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';

const profile = canonicalDemoProfile;
const rulesDiagnosis = diagnoseProfile(profile);

function aiProvider(overrides: Partial<AiProvider> = {}): AiProvider {
  return {
    enhanceDiagnosis: async () => ({
      ...rulesDiagnosis,
      goalSummary: 'You aim for a computer science bachelor’s degree in the US in 2028.',
    }),
    explainRecommendation: async () => ({
      summary: 'The reported bachelor program matches the target field.',
      reasons: ['A reported bachelor program matches the target field.'],
      concerns: ['Verify admissions requirements directly with the university.'],
    }),
    ...overrides,
  };
}

describe('optional AI explanations', () => {
  it('enhances diagnosis only when requested and keeps plain diagnosis deterministic', async () => {
    const enhanceDiagnosis = vi.fn<AiProvider['enhanceDiagnosis']>()
      .mockImplementation(aiProvider().enhanceDiagnosis);
    const app = buildApp({}, { aiProvider: aiProvider({ enhanceDiagnosis }) });
    try {
      const plain = await app.inject({ method: 'POST', url: '/api/diagnosis', payload: { profile } });
      expect(plain.json()).toEqual({ diagnosis: rulesDiagnosis, mode: 'rules' });
      expect(enhanceDiagnosis).not.toHaveBeenCalled();
      const enhanced = await app.inject({
        method: 'POST', url: '/api/diagnosis', payload: { profile, enhanceWithAi: true },
      });
      expect(enhanced.statusCode).toBe(200);
      expect(enhanced.json()).toMatchObject({ mode: 'gemini', promptVersion: '1.0.0' });
      expect(enhanced.json().diagnosis.goalSummary).toContain('computer science');
      expect(enhanceDiagnosis).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it('falls back for malformed or unsupported diagnosis wording', async () => {
    const app = buildApp({}, { aiProvider: aiProvider({
      enhanceDiagnosis: async () => ({
        ...rulesDiagnosis, goalSummary: 'The application deadline is January 1, 2028.',
      }),
    }) });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/diagnosis', payload: { profile, enhanceWithAi: true },
      });
      expect(response.json()).toEqual({ diagnosis: rulesDiagnosis, mode: 'rules' });
    } finally {
      await app.close();
    }
  });

  it('falls back when AI changes the diagnosis shape', async () => {
    const app = buildApp({}, { aiProvider: aiProvider({
      enhanceDiagnosis: async () => ({
        ...rulesDiagnosis, strengths: [...rulesDiagnosis.strengths, 'Invented strength'],
      }),
    }) });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/diagnosis', payload: { profile, enhanceWithAi: true },
      });
      expect(response.json()).toEqual({ diagnosis: rulesDiagnosis, mode: 'rules' });
    } finally {
      await app.close();
    }
  });

  it('falls back when AI is absent or throws without breaking deterministic endpoints', async () => {
    const missing = buildApp({}, { aiProvider: null, universityProvider: new DemoUniversityProvider() });
    const failing = buildApp({}, { aiProvider: aiProvider({
      enhanceDiagnosis: async () => { throw new Error('private-key'); },
    }) });
    try {
      const absent = await missing.inject({
        method: 'POST', url: '/api/diagnosis', payload: { profile, enhanceWithAi: true },
      });
      expect(absent.json()).toEqual({ diagnosis: rulesDiagnosis, mode: 'rules' });
      const recommendations = await missing.inject({
        method: 'POST', url: '/api/recommendations', payload: { profile },
      });
      expect(recommendations.statusCode).toBe(200);
      expect(recommendations.json().recommendations.length).toBeGreaterThanOrEqual(3);
      const failed = await failing.inject({
        method: 'POST', url: '/api/diagnosis', payload: { profile, enhanceWithAi: true },
      });
      expect(failed.json()).toEqual({ diagnosis: rulesDiagnosis, mode: 'rules' });
      expect(failed.body).not.toContain('private-key');
    } finally {
      await missing.close();
      await failing.close();
    }
  });

  it('returns grounded recommendation wording without changing ranking', async () => {
    const explainRecommendation = vi.fn<AiProvider['explainRecommendation']>()
      .mockImplementation(aiProvider().explainRecommendation);
    const provider = new DemoUniversityProvider();
    const app = buildApp({}, { universityProvider: provider, aiProvider: aiProvider({ explainRecommendation }) });
    const rulesApp = buildApp({}, { universityProvider: provider, aiProvider: null });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations/demo-redwood-state/explanation', payload: { profile },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        universityId: 'demo-redwood-state', engineVersion: '1.0.0',
        mode: 'gemini', promptVersion: '1.0.0',
        explanation: { summary: 'The reported bachelor program matches the target field.' },
      });
      expect(explainRecommendation).toHaveBeenCalledOnce();
      const withAi = await app.inject({ method: 'POST', url: '/api/recommendations', payload: { profile } });
      const withoutAi = await rulesApp.inject({ method: 'POST', url: '/api/recommendations', payload: { profile } });
      expect(withAi.json()).toEqual(withoutAi.json());
    } finally {
      await app.close();
      await rulesApp.close();
    }
  });

  it('rejects invented costs, probabilities, and extra source claims', async () => {
    for (const explanation of [
      { summary: 'Your tuition is $1,000.', reasons: [], concerns: [] },
      { summary: 'You have a 95% admission probability.', reasons: [], concerns: [] },
      { summary: 'This deadline is officially verified.', reasons: [], concerns: [] },
      { summary: 'Tuition is zero.', reasons: [], concerns: [] },
      { summary: 'Applications close in 2028.', reasons: [], concerns: [] },
      { summary: 'Fine.', reasons: [], concerns: [], sourceStatus: 'verified' },
    ]) {
      const app = buildApp({}, {
        universityProvider: new DemoUniversityProvider(),
        aiProvider: aiProvider({ explainRecommendation: async () => explanation }),
      });
      try {
        const response = await app.inject({
          method: 'POST', url: '/api/recommendations/demo-redwood-state/explanation', payload: { profile },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().mode).toBe('rules');
        expect(response.body).not.toContain('verified');
      } finally {
        await app.close();
      }
    }
  });

  it('returns a safe 404 for an unknown recommendation', async () => {
    const app = buildApp({}, { universityProvider: new DemoUniversityProvider(), aiProvider: null });
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/recommendations/missing/explanation', payload: { profile },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found', details: [] } });
    } finally {
      await app.close();
    }
  });
});
