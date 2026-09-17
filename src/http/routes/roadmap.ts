import type { FastifyPluginAsync } from 'fastify';
import type { AiProvider } from '../../application/ports/ai-provider.js';
import { createRoadmap, type RoadmapProviders } from '../../application/services/roadmap.js';
import { apiPaths } from './paths.js';

export function roadmapRoutes(
  providerFactory: () => RoadmapProviders,
  aiProviderFactory: () => AiProvider | null,
): FastifyPluginAsync {
  return async (app) => {
    app.post(apiPaths.roadmap, async (request) => createRoadmap(request.body, providerFactory, aiProviderFactory));
  };
}
