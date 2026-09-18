import type { FastifyPluginAsync } from 'fastify';
import type { LetterDraftProvider } from '../../application/ports/letter-draft-provider.js';
import type { LetterRepository } from '../../application/ports/letter-repository.js';
import type { UniversityContactRepository } from '../../application/ports/university-contact-repository.js';
import { createLetter, generateLetterDrafts, selectFinalLetterContent } from '../../application/services/letters.js';
import { apiPaths } from './paths.js';

export function letterRoutes(
  contacts: () => UniversityContactRepository,
  letters: () => LetterRepository,
  drafts: () => LetterDraftProvider | null,
): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: { universityId: string } }>(apiPaths.createLetter, async (request) =>
      createLetter(request.params.universityId, request.body, contacts, letters));
    app.post<{ Params: { letterId: string } }>(apiPaths.letterDrafts, async (request) =>
      generateLetterDrafts(request.params.letterId, request.body, letters, drafts));
    app.put<{ Params: { letterId: string } }>(apiPaths.letterContent, async (request) =>
      selectFinalLetterContent(request.params.letterId, request.body, letters));
  };
}
