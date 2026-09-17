import type { FastifyPluginAsync } from 'fastify';
import type { UniversityProvider } from '../../application/ports/university-provider.js';
import { createRecommendations } from '../../application/services/recommendations.js';

export function recommendationRoutes(providerFactory: () => UniversityProvider): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/recommendations', async (request) => createRecommendations(request.body, providerFactory));
  };
}
