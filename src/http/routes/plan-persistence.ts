import type { FastifyPluginAsync } from 'fastify';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import {
  getCurrentPlan, saveProfileAndPlan, updatePersistedRoadmapItem,
} from '../../application/services/plan-persistence.js';
import type { RoadmapProviders } from '../../application/services/roadmap.js';

export function planPersistenceRoutes(
  providerFactory: () => RoadmapProviders,
  repositoryFactory: () => PlanRepository,
): FastifyPluginAsync {
  return async (app) => {
    app.put('/api/profile', async (request) => saveProfileAndPlan(request.body, providerFactory, repositoryFactory));
    app.get<{ Params: { profileId: string } }>('/api/plan/:profileId', async (request) =>
      getCurrentPlan(request.params.profileId, repositoryFactory));
    app.patch<{ Params: { roadmapId: string; itemId: string } }>(
      '/api/roadmaps/:roadmapId/items/:itemId',
      async (request) => updatePersistedRoadmapItem(
        request.params.roadmapId, request.params.itemId, request.body, repositoryFactory,
      ),
    );
  };
}
