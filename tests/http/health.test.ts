import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { DatabaseUnavailableError } from '../../src/application/ports/plan-repository.js';

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

  it('checks readiness separately from liveness and keeps database errors safe', async () => {
    const ready = buildApp({}, { readinessCheck: async () => {} });
    const unavailable = buildApp({}, { readinessCheck: async () => {
      throw new DatabaseUnavailableError();
    } });
    try {
      const response = await ready.inject({ method: 'GET', url: '/api/ready' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ready' });
      const failed = await unavailable.inject({ method: 'GET', url: '/api/ready' });
      expect(failed.statusCode).toBe(503);
      expect(failed.json()).toEqual({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Database unavailable', details: [] },
      });
      expect((await unavailable.inject({ method: 'GET', url: '/api/health' })).json()).toEqual({ status: 'ok' });
    } finally {
      await ready.close();
      await unavailable.close();
    }
  });

  it('rejects oversized JSON with the common safe error response', async () => {
    const app = buildApp();
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/diagnosis',
        payload: { profile: { padding: 'private-key'.repeat(15000) } },
      });
      expect(response.statusCode).toBe(413);
      expect(response.json()).toEqual({
        error: { code: 'REQUEST_TOO_LARGE', message: 'Request body too large', details: [] },
      });
      expect(response.body).not.toContain('private-key');
    } finally {
      await app.close();
    }
  });

  it('returns safe errors without stack traces or secret error messages', async () => {
    const logs: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        logs.push(String(chunk));
        callback();
      },
    });
    const app = buildApp({ logger: { stream } });
    app.get('/test-error', async () => {
      const error = new Error('secret-token-123');
      error.name = 'secret-name-456';
      throw error;
    });
    try {
      const response = await app.inject({ method: 'GET', url: '/test-error?token=secret-url-789' });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        error: { code: 'INTERNAL', message: 'Internal server error', details: [] },
      });
      expect(response.body).not.toContain('secret-token-123');
      expect(response.body).not.toContain('stack');
      expect(logs.join('')).not.toContain('secret-token-123');
      expect(logs.join('')).not.toContain('secret-name-456');
      expect(logs.join('')).not.toContain('secret-url-789');
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
