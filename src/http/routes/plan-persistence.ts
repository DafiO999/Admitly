import type { FastifyPluginAsync } from 'fastify';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import {
  getCurrentPlan, recalculatePlan, saveProfileAndPlan, updatePersistedRoadmapItem,
} from '../../application/services/plan-persistence.js';
import type { RoadmapProviders } from '../../application/services/roadmap.js';
import { apiPaths } from './paths.js';

export function planPersistenceRoutes(
  providerFactory: () => RoadmapProviders,
  repositoryFactory: () => PlanRepository,
): FastifyPluginAsync {
  return async (app) => {
    app.put(apiPaths.profile, async (request) => saveProfileAndPlan(request.body, providerFactory, repositoryFactory));
    app.post(apiPaths.recalculate, async (request) =>
      recalculatePlan(request.body, providerFactory, repositoryFactory));
    app.get<{ Params: { profileId: string } }>(apiPaths.plan, async (request) =>
      getCurrentPlan(request.params.profileId, repositoryFactory));
    app.patch<{ Params: { roadmapId: string; itemId: string } }>(
      apiPaths.roadmapItem,
      async (request) => updatePersistedRoadmapItem(
        request.params.roadmapId, request.params.itemId, request.body, repositoryFactory,
      ),
    );
  };
}
