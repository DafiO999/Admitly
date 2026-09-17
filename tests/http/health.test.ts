import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('HTTP foundation', () => {
  it('returns a healthy response', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });

  it('returns safe errors without stack traces or secret error messages', async () => {
    const app = buildApp();
    app.get('/test-error', async () => {
      throw new Error('secret-token-123');
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/test-error' });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: { code: 'INTERNAL', message: 'Internal server error', details: [] },
      });
      expect(response.body).not.toContain('secret-token-123');
      expect(response.body).not.toContain('stack');
    } finally {
      await app.close();
    }
  });

  it('returns the common error shape for unknown routes', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/not-found' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'Not found', details: [] },
      });
    } finally {
      await app.close();
    }
  });
});
