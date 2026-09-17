import type { FastifyPluginAsync } from 'fastify';

export function healthRoutes(checkReadiness: () => Promise<void>): FastifyPluginAsync {
  return async (app) => {
    app.get('/api/health', async () => ({ status: 'ok' }));
    app.get('/api/ready', async () => {
      await checkReadiness();
      return { status: 'ready' };
    });
  };
}
