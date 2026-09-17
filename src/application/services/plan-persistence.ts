import { z } from 'zod';
import type { GeneratedPlan, PlanRepository } from '../ports/plan-repository.js';
import { UniversityProviderError } from '../ports/university-provider.js';
import { createRecommendations } from './recommendations.js';
import type { RoadmapProviders } from './roadmap.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { buildRoadmap } from '../../domain/roadmap/builder.js';
import { preserveCompletedTasks } from '../../domain/roadmap/preserve-completions.js';
import { roadmapStatusSchema } from '../../domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../../domain/university/requirement.js';
import {
  DIAGNOSIS_PROMPT_VERSION, RECOMMENDATION_EXPLANATION_PROMPT_VERSION, ROADMAP_PROMPT_VERSION,
} from '../../domain/versions.js';

export const saveProfileRequestSchema = z.object({ profile: studentProfileSchema }).strict();
export const recalculateRequestSchema = z.object({ profile: studentProfileSchema.safeExtend({ id: z.uuid() }) }).strict();
export const statusRequestSchema = z.object({ status: roadmapStatusSchema }).strict();
const idSchema = z.uuid();

export class PersistedPlanNotFoundError extends Error {
  constructor() {
    super('Plan or roadmap item not found');
    this.name = 'PersistedPlanNotFoundError';
  }
}

async function generatePlan(
  profile: z.infer<typeof studentProfileSchema>,
  providerFactory: () => RoadmapProviders,
): Promise<GeneratedPlan> {
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
  return {
    profile, engineVersion: recommendations.engineVersion,
    recommendations: recommendations.recommendations,
    roadmap: generated.roadmap, sourceCoverage: generated.sourceCoverage, selectedUniversityIds,
    promptVersions: {
      diagnosis: DIAGNOSIS_PROMPT_VERSION,
      recommendationExplanation: RECOMMENDATION_EXPLANATION_PROMPT_VERSION,
      roadmap: ROADMAP_PROMPT_VERSION,
    },
  };
}

export async function saveProfileAndPlan(
  input: unknown,
  providerFactory: () => RoadmapProviders,
  repositoryFactory: () => PlanRepository,
) {
  const { profile } = saveProfileRequestSchema.parse(input);
  const plan = await generatePlan(profile, providerFactory);
  return repositoryFactory().saveGenerated(plan);
}

export async function recalculatePlan(
  input: unknown,
  providerFactory: () => RoadmapProviders,
  repositoryFactory: () => PlanRepository,
) {
  const { profile } = recalculateRequestSchema.parse(input);
  const repository = repositoryFactory();
  const current = await repository.findCurrent(profile.id);
  if (!current) throw new PersistedPlanNotFoundError();
  const generated = await generatePlan(profile, providerFactory);
  generated.roadmap = preserveCompletedTasks(
    current.roadmap, generated.roadmap, current.profile, profile,
    current.roadmap.selectedUniversityIds, generated.selectedUniversityIds,
  );
  generated.expectedCurrentRoadmapId = current.roadmap.id;
  generated.expectedCurrentRoadmapStatuses = current.roadmap.items.map((item) => ({
    key: item.id, status: item.status,
  }));
  return repository.saveGenerated(generated);
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
