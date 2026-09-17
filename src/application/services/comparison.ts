import { z } from 'zod';
import type { AdmissionRequirementProvider } from '../ports/admission-requirement-provider.js';
import { UniversityProviderError, type UniversityProvider } from '../ports/university-provider.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { rankUniversities } from '../../domain/recommendation/engine.js';
import { RECOMMENDATION_ENGINE_VERSION } from '../../domain/versions.js';
import { admissionRequirementSchema } from '../../domain/university/requirement.js';
import { universitySchema } from '../../domain/university/schema.js';

export const comparisonRequestSchema = z.object({
  profile: studentProfileSchema,
  universityIds: z.array(z.string().min(1)).min(2).max(3).refine((ids) => new Set(ids).size === ids.length, {
    message: 'University IDs must be unique',
  }),
}).strict();

export interface ComparisonProviders {
  universityProvider: UniversityProvider;
  requirementProvider: AdmissionRequirementProvider;
}

export class ComparisonUniversityNotFoundError extends Error {
  constructor() {
    super('Requested university not found');
    this.name = 'ComparisonUniversityNotFoundError';
  }
}

export async function createComparison(input: unknown, providerFactory: () => ComparisonProviders) {
  const { profile, universityIds } = comparisonRequestSchema.parse(input);
  const { universityProvider, requirementProvider } = providerFactory();
  const loaded = await Promise.all(universityIds.map((id) => universityProvider.getById(id)));
  if (loaded.some((university) => university === null)) throw new ComparisonUniversityNotFoundError();
  const universities = universitySchema.array().safeParse(loaded);
  if (!universities.success || universities.data.some((university, index) => university.id !== universityIds[index])) {
    throw new UniversityProviderError('INVALID_RESPONSE');
  }

  const requirements = admissionRequirementSchema.array().safeParse(
    await requirementProvider.listByUniversityIds(universityIds),
  );
  if (!requirements.success || requirements.data.some((requirement) => !universityIds.includes(requirement.universityId))
    || new Set(requirements.data.map((requirement) => requirement.id)).size !== requirements.data.length) {
    throw new UniversityProviderError('INVALID_RESPONSE');
  }
  const recommendations = new Map(rankUniversities(profile, universities.data)
    .map((recommendation) => [recommendation.universityId, recommendation]));

  return {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    comparisons: universities.data.map((university) => {
      const ranked = recommendations.get(university.id);
      const programKeys = new Set(university.programs
        .filter((program) => program.field === profile.targetField).map((program) => program.key));
      const schoolRequirements = requirements.data.filter((requirement) =>
        requirement.universityId === university.id
        && (!requirement.programKey || programKeys.has(requirement.programKey)));
      return {
        university,
        recommendation: ranked ? {
          universityId: ranked.universityId,
          fitScore: ranked.fitScore,
          components: ranked.components,
          reasonCodes: ranked.reasonCodes,
          concerns: ranked.concerns,
        } : null,
        requirements: schoolRequirements,
        requirementsStatus: schoolRequirements.length ? 'reported' as const : 'unknown' as const,
      };
    }),
  };
}
