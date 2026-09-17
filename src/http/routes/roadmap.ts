import type { FastifyPluginAsync } from 'fastify';
import type { AiProvider } from '../../application/ports/ai-provider.js';
import { createRoadmap, type RoadmapProviders } from '../../application/services/roadmap.js';

export function roadmapRoutes(
  providerFactory: () => RoadmapProviders,
  aiProviderFactory: () => AiProvider | null,
): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/roadmap', async (request) => createRoadmap(request.body, providerFactory, aiProviderFactory));
  };
}
