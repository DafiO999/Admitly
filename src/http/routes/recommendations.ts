import type { FastifyPluginAsync } from 'fastify';
import type { AiProvider } from '../../application/ports/ai-provider.js';
import type { UniversityProvider } from '../../application/ports/university-provider.js';
import { createRecommendationExplanation } from '../../application/services/recommendation-explanation.js';
import { createRecommendations } from '../../application/services/recommendations.js';
import { apiPaths } from './paths.js';

export function recommendationRoutes(
  providerFactory: () => UniversityProvider,
  aiProviderFactory: () => AiProvider | null,
): FastifyPluginAsync {
  return async (app) => {
    app.post(apiPaths.recommendations, async (request) => createRecommendations(request.body, providerFactory));
    app.post<{ Params: { universityId: string } }>(
      apiPaths.recommendationExplanation,
      async (request) => createRecommendationExplanation(
        request.body, request.params.universityId, providerFactory, aiProviderFactory,
        request.headers['accept-language']?.toLowerCase().startsWith('ru') ? 'ru' : 'en',
      ),
    );
  };
}
