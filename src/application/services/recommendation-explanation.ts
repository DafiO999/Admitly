import { z } from 'zod';
import type { AiProvider } from '../ports/ai-provider.js';
import { UniversityProviderError, type UniversityProvider } from '../ports/university-provider.js';
import { isGroundedWording } from './ai-guard.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { rankUniversities } from '../../domain/recommendation/engine.js';
import {
  recommendationExplanationSchema, type RecommendationExplanation,
} from '../../domain/recommendation/schema.js';
import { RECOMMENDATION_ENGINE_VERSION, RECOMMENDATION_EXPLANATION_PROMPT_VERSION } from '../../domain/versions.js';
import { universitySchema } from '../../domain/university/schema.js';

export const explanationRequestSchema = z.object({ profile: studentProfileSchema }).strict();

export class RecommendationNotFoundError extends Error {
  constructor() {
    super('Recommendation not found');
    this.name = 'RecommendationNotFoundError';
  }
}

export async function createRecommendationExplanation(
  input: unknown,
  universityId: string,
  universityProviderFactory: () => UniversityProvider,
  aiProviderFactory: () => AiProvider | null,
) {
  const { profile } = explanationRequestSchema.parse(input);
  if (!universityId) throw new RecommendationNotFoundError();
  const university = await universityProviderFactory().getById(universityId);
  if (!university) throw new RecommendationNotFoundError();
  const normalized = universitySchema.safeParse(university);
  if (!normalized.success || normalized.data.id !== universityId) throw new UniversityProviderError('INVALID_RESPONSE');
  const ranked = rankUniversities(profile, [normalized.data])[0];
  if (!ranked) throw new RecommendationNotFoundError();

  const reasons = ranked.components.flatMap((component) => component.reasons);
  const concerns = ranked.concerns.map((concern) => concern.message);
  const fallback: RecommendationExplanation = {
    summary: `${normalized.data.name} has a ${ranked.fitScore}/100 profile-fit score for the target field.`,
    reasons: reasons.slice(0, 4),
    concerns: concerns.slice(0, 4),
  };
  const rulesResponse = {
    universityId, engineVersion: RECOMMENDATION_ENGINE_VERSION,
    explanation: fallback, mode: 'rules' as const,
  };

  try {
    const provider = aiProviderFactory();
    if (!provider) return rulesResponse;
    const candidate = recommendationExplanationSchema.safeParse(await provider.explainRecommendation({
      universityName: normalized.data.name, fitScore: ranked.fitScore, reasons, concerns,
    }));
    if (!candidate.success || !isGroundedWording(
      [candidate.data.summary, ...candidate.data.reasons, ...candidate.data.concerns],
      [normalized.data.name, String(ranked.fitScore), ...reasons, ...concerns],
    )) return rulesResponse;
    return {
      universityId, engineVersion: RECOMMENDATION_ENGINE_VERSION,
      explanation: candidate.data, mode: 'gemini' as const,
      promptVersion: RECOMMENDATION_EXPLANATION_PROMPT_VERSION,
    };
  } catch {
    return rulesResponse;
  }
}
