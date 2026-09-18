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

const russianComponents = {
  academic: 'Академические данные', program: 'Совпадение программы',
  budget: 'Соответствие бюджету', preferences: 'Предпочтения',
} as const;

const russianConcerns: Record<string, string> = {
  SAT_REFERENCE_UNKNOWN: 'Нет опубликованного ориентира по SAT.',
  SAT_NOT_PROVIDED: 'Результат SAT не указан; его вклад в оценку нейтрален.',
  COST_UNKNOWN: 'Уточните стоимость обучения и общие расходы у университета.',
  COST_SCOPE_LIMITED: 'Указанная стоимость обучения может не отражать полные расходы иностранного студента.',
  STATE_UNKNOWN: 'Штат университета не указан.',
  CAMPUS_SIZE_UNKNOWN: 'Размер кампуса неизвестен.',
};

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
  language: 'en' | 'ru' = 'en',
) {
  const { profile } = explanationRequestSchema.parse(input);
  if (!universityId) throw new RecommendationNotFoundError();
  const university = await universityProviderFactory().getById(universityId);
  if (!university) throw new RecommendationNotFoundError();
  const normalized = universitySchema.safeParse(university);
  if (!normalized.success || normalized.data.id !== universityId) throw new UniversityProviderError('INVALID_RESPONSE');
  const ranked = rankUniversities(profile, [normalized.data])[0];
  if (!ranked) throw new RecommendationNotFoundError();

  if (language === 'ru') {
    return {
      universityId, engineVersion: RECOMMENDATION_ENGINE_VERSION,
      explanation: recommendationExplanationSchema.parse({
        summary: `${normalized.data.name}: соответствие профилю ${ranked.fitScore} из 100 по выбранному направлению. Это не вероятность поступления.`,
        reasons: ranked.components.map((component) =>
          `${russianComponents[component.key]}: ${component.score} из ${component.maxScore} баллов.`),
        concerns: ranked.concerns.filter((concern) => concern.code !== 'REQUIREMENT_UNKNOWN').slice(0, 4).map((concern) =>
          russianConcerns[concern.code] ?? 'Уточните данные непосредственно в университете.'),
      }),
      mode: 'rules' as const,
    };
  }

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
