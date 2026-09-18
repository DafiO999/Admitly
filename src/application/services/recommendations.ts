import { z } from 'zod';
import { UniversityProviderError, type UniversityProvider } from '../ports/university-provider.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { rankUniversities } from '../../domain/recommendation/engine.js';
import { RECOMMENDATION_ENGINE_VERSION } from '../../domain/versions.js';
import { universitySchema } from '../../domain/university/schema.js';

export const recommendationRequestSchema = z.object({ profile: studentProfileSchema }).strict();

export async function createRecommendations(input: unknown, providerFactory: () => UniversityProvider) {
  const { profile } = recommendationRequestSchema.parse(input);
  const provider = providerFactory();
  const general = await provider.search({ field: profile.targetField, limit: 100 });
  const preferred = profile.preferredStates?.length
    ? await provider.search({ field: profile.targetField, states: profile.preferredStates, limit: 100 }) : [];
  const result = universitySchema.array().safeParse([...general, ...preferred]);
  if (!result.success) throw new UniversityProviderError('INVALID_RESPONSE');
  return {
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    recommendations: rankUniversities(profile, result.data),
  };
}
