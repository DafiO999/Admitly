import type { Diagnosis } from '../../domain/diagnosis/schema.js';
import type { RecommendationExplanation } from '../../domain/recommendation/schema.js';

export interface RecommendationAiInput {
  universityName: string;
  fitScore: number;
  reasons: string[];
  concerns: string[];
}

export interface AiProvider {
  enhanceDiagnosis(diagnosis: Diagnosis): Promise<Diagnosis>;
  explainRecommendation(input: RecommendationAiInput): Promise<RecommendationExplanation>;
}

export type AiProviderErrorCode = 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_RESPONSE' | 'CONFIGURATION';

export class AiProviderError extends Error {
  constructor(public readonly code: AiProviderErrorCode) {
    super(`AI provider ${code.toLowerCase().replace('_', ' ')}`);
    this.name = 'AiProviderError';
  }
}
