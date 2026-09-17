import type { FastifyPluginAsync } from 'fastify';
import { apiPaths } from './paths.js';

export function healthRoutes(checkReadiness: () => Promise<void>): FastifyPluginAsync {
  return async (app) => {
    app.get(apiPaths.health, async () => ({ status: 'ok' }));
    app.get(apiPaths.ready, async () => {
      await checkReadiness();
      return { status: 'ready' };
    });
  };
}
