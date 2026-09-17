import type { AiProvider } from '../application/ports/ai-provider.js';
import type { Environment } from '../config/env.js';
import { GeminiAiProvider, type GeminiOptions } from './gemini/ai-provider.js';

export function createAiProvider(
  env: Pick<Environment, 'GEMINI_API_KEY' | 'GEMINI_MODEL'>,
  options: Omit<GeminiOptions, 'apiKey' | 'model'> = {},
): AiProvider | null {
  if (!env.GEMINI_API_KEY) return null;
  return new GeminiAiProvider({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL ?? 'gemini-3.8-flash',
    ...options,
  });
}
