import { z } from 'zod';
import {
  AiProviderError, type AiProvider, type RecommendationAiInput, type RoadmapAiItem,
} from '../../application/ports/ai-provider.js';
import { aiDiagnosisOutputSchema, type Diagnosis } from '../../domain/diagnosis/schema.js';
import { recommendationExplanationSchema, type RecommendationExplanation } from '../../domain/recommendation/schema.js';
import {
  DIAGNOSIS_PROMPT_VERSION, RECOMMENDATION_EXPLANATION_PROMPT_VERSION, ROADMAP_PROMPT_VERSION,
} from '../../domain/versions.js';

const responseSchema = z.object({
  candidates: z.array(z.object({
    content: z.object({
      parts: z.array(z.object({ text: z.string().optional() }).passthrough()),
    }).passthrough(),
  }).passthrough()),
}).passthrough();

const diagnosisJsonSchema = {
  type: 'object',
  properties: {
    goalSummary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    focusNow: { type: 'array', items: { type: 'string' } },
  },
  required: ['goalSummary', 'strengths', 'constraints', 'focusNow'],
};

const explanationJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    reasons: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'reasons', 'concerns'],
};

const roadmapJsonSchema = {
  type: 'object',
  properties: {
    items: { type: 'array', items: {
      type: 'object',
      properties: { id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' } },
      required: ['id', 'title'],
    } },
  },
  required: ['items'],
};

const roadmapOutputSchema = z.object({
  items: z.array(z.object({
    id: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(300).optional(),
  }).strict()).max(50),
}).strict();

const PROMPT_RULES = [
  'Use only the supplied deterministic facts.',
  'Do not add deadlines, requirements, costs, probabilities, guarantees, or source claims.',
  'If a fact is missing, omit it or mark it unknown.',
  'Do not change rankings or scores. Return only the requested JSON object.',
].join(' ');

export interface GeminiOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class GeminiAiProvider implements AiProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: GeminiOptions) {
    if (!options.apiKey.trim() || !/^[A-Za-z0-9._-]+$/.test(options.model)
      || (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1))) {
      throw new AiProviderError('CONFIGURATION');
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async enhanceDiagnosis(diagnosis: Diagnosis): Promise<Diagnosis> {
    const prompt = [
      `Diagnosis prompt version ${DIAGNOSIS_PROMPT_VERSION}. ${PROMPT_RULES}`,
      'Rewrite the diagnosis with the same number of strengths, constraints, and focus items.',
      JSON.stringify(diagnosis),
    ].join('\n');
    const output = await this.generate(prompt, diagnosisJsonSchema);
    const parsed = aiDiagnosisOutputSchema.safeParse(output);
    if (!parsed.success) throw new AiProviderError('INVALID_RESPONSE');
    return parsed.data;
  }

  async explainRecommendation(input: RecommendationAiInput): Promise<RecommendationExplanation> {
    const prompt = [
      `Recommendation explanation prompt version ${RECOMMENDATION_EXPLANATION_PROMPT_VERSION}. ${PROMPT_RULES}`,
      'Summarize the profile fit using the supplied reasons and concerns. The fit score is not an admission probability.',
      JSON.stringify(input),
    ].join('\n');
    const output = await this.generate(prompt, explanationJsonSchema);
    const parsed = recommendationExplanationSchema.safeParse(output);
    if (!parsed.success) throw new AiProviderError('INVALID_RESPONSE');
    return parsed.data;
  }

  async rewriteRoadmap(items: RoadmapAiItem[]): Promise<RoadmapAiItem[]> {
    const prompt = [
      `Roadmap wording prompt version ${ROADMAP_PROMPT_VERSION}. ${PROMPT_RULES}`,
      'Rewrite only titles and descriptions. Keep every ID and the item order. Do not add tasks or change factual details.',
      JSON.stringify({ items }),
    ].join('\n');
    const output = await this.generate(prompt, roadmapJsonSchema);
    const parsed = roadmapOutputSchema.safeParse(output);
    if (!parsed.success) throw new AiProviderError('INVALID_RESPONSE');
    return parsed.data.items.map((item) => ({
      id: item.id, title: item.title, ...(item.description ? { description: item.description } : {}),
    }));
  }

  private async generate(prompt: string, outputSchema: object): Promise<unknown> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json', responseSchema: outputSchema,
        temperature: 0.2, maxOutputTokens: 1024,
      },
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const signal = AbortSignal.timeout(this.timeoutMs);
      let response: Response;
      try {
        response = await this.fetcher(url, {
          method: 'POST', headers: { 'x-goog-api-key': this.apiKey, 'Content-Type': 'application/json' },
          body, signal,
        });
      } catch {
        if (attempt === 0) continue;
        throw new AiProviderError(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE');
      }
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) continue;
        throw new AiProviderError('UNAVAILABLE');
      }
      try {
        const envelope: unknown = await response.json();
        const parsed = responseSchema.safeParse(envelope);
        const text = parsed.success ? parsed.data.candidates[0]?.content.parts.find((part) => part.text)?.text : undefined;
        if (!text) throw new AiProviderError('INVALID_RESPONSE');
        return JSON.parse(text) as unknown;
      } catch {
        if (signal.aborted && attempt === 0) continue;
        throw new AiProviderError(signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE');
      }
    }
    throw new AiProviderError('UNAVAILABLE');
  }
}
