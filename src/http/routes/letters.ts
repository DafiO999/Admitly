import type { FastifyPluginAsync } from 'fastify';
import type { LetterDraftProvider } from '../../application/ports/letter-draft-provider.js';
import type { LetterRepository } from '../../application/ports/letter-repository.js';
import type { UniversityContactRepository } from '../../application/ports/university-contact-repository.js';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import { createLetter, generateLetterDrafts, selectFinalLetterContent } from '../../application/services/letters.js';
import { requireProfileAccess } from '../profile-access.js';
import { z } from 'zod';
import { apiPaths } from './paths.js';

export function letterRoutes(
  contacts: () => UniversityContactRepository,
  letters: () => LetterRepository,
  drafts: () => LetterDraftProvider | null,
  plans: () => PlanRepository,
  accessSecret: () => string,
): FastifyPluginAsync {
  return async (app) => {
    const requireLetter = async (request: Parameters<typeof requireProfileAccess>[0], letterId: string) => {
      const profileId = await plans().findLetterProfileId(z.uuid().parse(letterId));
      if (profileId) requireProfileAccess(request, profileId, accessSecret());
    };
    app.post<{ Params: { universityId: string } }>(apiPaths.createLetter, async (request) => {
      const profileId = z.object({ profileId: z.uuid() }).passthrough().parse(request.body).profileId;
      requireProfileAccess(request, profileId, accessSecret());
      return createLetter(request.params.universityId, request.body, contacts, letters);
    });
    app.post<{ Params: { letterId: string } }>(apiPaths.letterDrafts, async (request) => {
      await requireLetter(request, request.params.letterId);
      return generateLetterDrafts(request.params.letterId, request.body, letters, drafts);
    });
    app.put<{ Params: { letterId: string } }>(apiPaths.letterContent, async (request) => {
      await requireLetter(request, request.params.letterId);
      return selectFinalLetterContent(request.params.letterId, request.body, letters);
    });
  };
}
