import { describe, expect, it, vi } from 'vitest';
import { AiProviderError } from '../../src/application/ports/ai-provider.js';
import { createAiProvider } from '../../src/infrastructure/ai-provider.js';
import { GeminiAiProvider } from '../../src/infrastructure/gemini/ai-provider.js';

function geminiResponse(value: unknown): Response {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(value) }] } }],
  }));
}

const explanation = {
  summary: 'The reported bachelor program matches the target field.',
  reasons: ['The reported program matches the target field.'],
  concerns: ['Verify admissions requirements directly with the university.'],
};

const input = {
  universityName: 'Example University', fitScore: 80,
  reasons: ['A reported bachelor program matches the target field.'],
  concerns: ['Verify admissions requirements directly with the university.'],
};

describe('Gemini AI provider', () => {
  it('uses structured JSON with a header key and a versioned grounded prompt', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(geminiResponse(explanation));
    const provider = new GeminiAiProvider({ apiKey: 'private-key', model: 'gemini-3.8-flash', fetcher });
    expect(await provider.explainRecommendation(input)).toEqual(explanation);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('/models/gemini-3.8-flash:generateContent');
    expect(String(url)).not.toContain('private-key');
    expect(options?.headers).toMatchObject({ 'x-goog-api-key': 'private-key' });
    const body = JSON.parse(String(options?.body));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema.required).toEqual(['summary', 'reasons', 'concerns']);
    expect(body.contents[0].parts[0].text).toContain('prompt version 1.0.0');
    expect(body.contents[0].parts[0].text).toContain('Do not add deadlines');
  });

  it('rejects malformed model JSON without retrying or exposing the key', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{bad-json' }] } }],
    })));
    const provider = new GeminiAiProvider({ apiKey: 'private-key', model: 'gemini-3.8-flash', fetcher });
    await expect(provider.explainRecommendation(input)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    try {
      await provider.explainRecommendation(input);
    } catch (error) {
      expect(error).toBeInstanceOf(AiProviderError);
      expect(String(error)).not.toContain('private-key');
    }
  });

  it('retries a transient failure once and then succeeds', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('rate limited', { status: 429 }))
      .mockResolvedValueOnce(geminiResponse(explanation));
    const provider = new GeminiAiProvider({ apiKey: 'private-key', model: 'gemini-3.8-flash', fetcher });
    expect(await provider.explainRecommendation(input)).toEqual(explanation);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops after two timed-out attempts', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error('private-key')));
    }));
    const provider = new GeminiAiProvider({ apiKey: 'private-key', model: 'gemini-3.8-flash', timeoutMs: 1, fetcher });
    await expect(provider.explainRecommendation(input)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the provider optional without a key', () => {
    expect(createAiProvider({ GEMINI_API_KEY: undefined, GEMINI_MODEL: undefined })).toBeNull();
    expect(() => new GeminiAiProvider({ apiKey: 'private-key', model: '../bad' })).toThrow(AiProviderError);
  });

  it('requests structured roadmap wording and rejects malformed items', async () => {
    const items = [{ id: 'research:programs', title: 'Review selected bachelor programs' }];
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(geminiResponse({ items }))
      .mockResolvedValueOnce(geminiResponse({ items: [{ id: 'research:programs', title: 'Fine', dueDate: '2028-01-01' }] }));
    const provider = new GeminiAiProvider({ apiKey: 'private-key', model: 'gemini-3.8-flash', fetcher });
    expect(await provider.rewriteRoadmap(items)).toEqual(items);
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.generationConfig.responseSchema.required).toEqual(['items']);
    expect(body.contents[0].parts[0].text).toContain('Roadmap wording prompt version 1.0.0');
    await expect(provider.rewriteRoadmap(items)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
