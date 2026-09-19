import type { FastifyPluginAsync } from 'fastify';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import type { UniversityContactRepository } from '../../application/ports/university-contact-repository.js';
import {
  getCurrentPlan, recalculatePlan, recalculateRequestSchema, saveProfileAndPlan, saveProfileRequestSchema,
  updatePersistedRoadmapItem,
} from '../../application/services/plan-persistence.js';
import type { RoadmapProviders } from '../../application/services/roadmap.js';
import { createProfileAccessToken, requireProfileAccess } from '../profile-access.js';
import { z } from 'zod';
import { apiPaths } from './paths.js';

export function planPersistenceRoutes(
  providerFactory: () => RoadmapProviders,
  repositoryFactory: () => PlanRepository,
  contacts: () => UniversityContactRepository | null,
  accessSecret: () => string,
): FastifyPluginAsync {
  return async (app) => {
    app.put(apiPaths.profile, async (request) => {
      const input = saveProfileRequestSchema.parse(request.body);
      if (input.profile.id) requireProfileAccess(request, input.profile.id, accessSecret());
      const plan = await saveProfileAndPlan(input, providerFactory, repositoryFactory, contacts);
      return { ...plan, accessToken: createProfileAccessToken(plan.profile.id, accessSecret()) };
    });
    app.post(apiPaths.recalculate, async (request) => {
      const { profile } = recalculateRequestSchema.parse(request.body);
      requireProfileAccess(request, profile.id, accessSecret());
      const plan = await recalculatePlan({ profile }, providerFactory, repositoryFactory, contacts);
      return { ...plan, accessToken: createProfileAccessToken(profile.id, accessSecret()) };
    });
    app.get<{ Params: { profileId: string } }>(apiPaths.plan, async (request) => {
      const profileId = z.uuid().parse(request.params.profileId);
      requireProfileAccess(request, profileId, accessSecret());
      const plan = await getCurrentPlan(profileId, repositoryFactory);
      return { ...plan, accessToken: createProfileAccessToken(profileId, accessSecret()) };
    });
    app.patch<{ Params: { roadmapId: string; itemId: string } }>(
      apiPaths.roadmapItem,
      async (request) => {
        const roadmapId = z.uuid().parse(request.params.roadmapId);
        const profileId = await repositoryFactory().findRoadmapProfileId(roadmapId);
        if (!profileId) return updatePersistedRoadmapItem(
          roadmapId, request.params.itemId, request.body, repositoryFactory,
        );
        requireProfileAccess(request, profileId, accessSecret());
        return updatePersistedRoadmapItem(roadmapId, request.params.itemId, request.body, repositoryFactory);
      },
    );
  };
}
