import { z } from 'zod';
import type { PlanRepository } from '../ports/plan-repository.js';
import { UniversityProviderError } from '../ports/university-provider.js';
import { createRecommendations } from './recommendations.js';
import type { RoadmapProviders } from './roadmap.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { buildRoadmap } from '../../domain/roadmap/builder.js';
import { roadmapStatusSchema } from '../../domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../../domain/university/requirement.js';

const saveProfileRequestSchema = z.object({ profile: studentProfileSchema }).strict();
const statusRequestSchema = z.object({ status: roadmapStatusSchema }).strict();
const idSchema = z.uuid();

export class PersistedPlanNotFoundError extends Error {
  constructor() {
    super('Plan or roadmap item not found');
    this.name = 'PersistedPlanNotFoundError';
  }
}

export async function saveProfileAndPlan(
  input: unknown,
  providerFactory: () => RoadmapProviders,
  repositoryFactory: () => PlanRepository,
) {
  const { profile } = saveProfileRequestSchema.parse(input);
  const providers = providerFactory();
  const recommendations = await createRecommendations({ profile }, () => providers.universityProvider);
  const selected = recommendations.recommendations.slice(0, 3);
  const selectedUniversityIds = selected
    .map((recommendation) => recommendation.universityId);
  const requirements = admissionRequirementSchema.array().safeParse(
    selectedUniversityIds.length
      ? await providers.requirementProvider.listByUniversityIds(selectedUniversityIds) : [],
  );
  if (!requirements.success || requirements.data.some((requirement) =>
    !selectedUniversityIds.includes(requirement.universityId))
    || new Set(requirements.data.map((requirement) => requirement.id)).size !== requirements.data.length) {
    throw new UniversityProviderError('INVALID_RESPONSE');
  }
  const generated = buildRoadmap(profile, selected.map((recommendation) => ({
    university: recommendation.university,
    requirements: requirements.data,
  })));
  return repositoryFactory().saveGenerated({
    profile, engineVersion: recommendations.engineVersion,
    recommendations: recommendations.recommendations,
    roadmap: generated.roadmap, sourceCoverage: generated.sourceCoverage, selectedUniversityIds,
  });
}

export async function getCurrentPlan(profileId: string, repositoryFactory: () => PlanRepository) {
  const plan = await repositoryFactory().findCurrent(idSchema.parse(profileId));
  if (!plan) throw new PersistedPlanNotFoundError();
  return plan;
}

export async function updatePersistedRoadmapItem(
  roadmapId: string,
  itemKey: string,
  input: unknown,
  repositoryFactory: () => PlanRepository,
) {
  const id = idSchema.parse(roadmapId);
  const key = z.string().min(1).parse(itemKey);
  const { status } = statusRequestSchema.parse(input);
  const roadmap = await repositoryFactory().updateItemStatus(id, key, status);
  if (!roadmap) throw new PersistedPlanNotFoundError();
  return { roadmap };
}
