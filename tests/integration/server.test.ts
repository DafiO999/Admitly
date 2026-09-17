import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

describe('server startup', () => {
  it('listens and serves the health route', async () => {
    const app = buildApp();
    try {
      const address = await app.listen({ host: '127.0.0.1', port: 0 });
      const response = await fetch(`${address}/api/health`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'ok' });
    } finally {
      await app.close();
    }
  });
});
