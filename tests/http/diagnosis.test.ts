import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';

describe('POST /api/diagnosis', () => {
  it('returns the documented rules response for a valid profile', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/diagnosis', payload: { profile: canonicalDemoProfile },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        diagnosis: {
          goalSummary: 'You aim to study computer science for a bachelor’s degree in the US, starting in 2028.',
          strengths: [
            'Your normalized GPA is 3.6/4, at or above the 3.5/4 planning threshold.',
            'Your IELTS score is 7.',
            'You have an SAT score of 1240.',
          ],
          constraints: [],
          focusNow: ['Review bachelor’s programs in computer science for 2028 intake.'],
        },
        mode: 'rules',
      });
    } finally {
      await app.close();
    }
  });

  it('returns a safe validation error for an invalid profile', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/diagnosis',
        payload: { profile: { ...canonicalDemoProfile, gpaValue: 9, privateNote: 'secret-token-123' } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: 'VALIDATION', message: 'Invalid request', details: [] },
      });
      expect(response.body).not.toContain('secret-token-123');
      expect(response.body).not.toContain('stack');
    } finally {
      await app.close();
    }
  });
});
