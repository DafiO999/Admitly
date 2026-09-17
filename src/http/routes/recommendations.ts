import type { FastifyPluginAsync } from 'fastify';
import type { AiProvider } from '../../application/ports/ai-provider.js';
import type { UniversityProvider } from '../../application/ports/university-provider.js';
import { createRecommendationExplanation } from '../../application/services/recommendation-explanation.js';
import { createRecommendations } from '../../application/services/recommendations.js';

export function recommendationRoutes(
  providerFactory: () => UniversityProvider,
  aiProviderFactory: () => AiProvider | null,
): FastifyPluginAsync {
  return async (app) => {
    app.post('/api/recommendations', async (request) => createRecommendations(request.body, providerFactory));
    app.post<{ Params: { universityId: string } }>(
      '/api/recommendations/:universityId/explanation',
      async (request) => createRecommendationExplanation(
        request.body, request.params.universityId, providerFactory, aiProviderFactory,
      ),
    );
  };
}
