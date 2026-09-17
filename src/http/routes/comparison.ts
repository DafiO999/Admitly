import type { FastifyPluginAsync } from 'fastify';
import { createComparison, type ComparisonProviders } from '../../application/services/comparison.js';
import { apiPaths } from './paths.js';

export function comparisonRoutes(providerFactory: () => ComparisonProviders): FastifyPluginAsync {
  return async (app) => {
    app.post(apiPaths.comparison, async (request) => createComparison(request.body, providerFactory));
  };
}
