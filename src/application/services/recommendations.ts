import { z } from 'zod';
import { UniversityProviderError, type UniversityProvider } from '../ports/university-provider.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { rankUniversities } from '../../domain/recommendation/engine.js';
import { RECOMMENDATION_ENGINE_VERSION } from '../../domain/versions.js';
import { universitySchema } from '../../domain/university/schema.js';

const recommendationRequestSchema = z.object({ profile: studentProfileSchema }).strict();

export async function createRecommendations(input: unknown, providerFactory: () => UniversityProvider) {
  const { profile } = recommendationRequestSchema.parse(input);
  const provider = providerFactory();
  const result = universitySchema.array().safeParse(await provider.search({ field: profile.targetField, limit: 20 }));
  if (!result.success) throw new UniversityProviderError('INVALID_RESPONSE');
  return {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    recommendations: rankUniversities(profile, result.data),
  };
}
