import type { GeneratedLetterDrafts, GenerateLetterDraftsInput } from '../../domain/letter/schema.js';

export interface LetterDraftProvider {
  generateLetterDrafts(input: GenerateLetterDraftsInput): Promise<GeneratedLetterDrafts>;
}
