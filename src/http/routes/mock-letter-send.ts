import type { FastifyPluginAsync } from 'fastify';
import type { LetterDraftProvider } from '../../application/ports/letter-draft-provider.js';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import { mockLetterDraftsRequestSchema, mockLetterSendRequestSchema,
  prepareMockLetterDrafts, simulateLetterSend } from '../../application/services/mock-letter-send.js';
import { requireProfileAccess } from '../profile-access.js';
import { apiPaths } from './paths.js';

export function mockLetterSendRoutes(
  plans: () => PlanRepository,
  mode: () => 'mock' | 'smtp',
  drafts: () => LetterDraftProvider | null,
  accessSecret: () => string,
): FastifyPluginAsync {
  return async (app) => {
    app.get(apiPaths.letterDeliveryMode, async () => ({ mode: mode() }));
    app.post(apiPaths.mockLetterDrafts, async (request) => {
      const input = mockLetterDraftsRequestSchema.parse(request.body);
      requireProfileAccess(request, input.profileId, accessSecret());
      return prepareMockLetterDrafts(input, plans, drafts);
    });
    app.post(apiPaths.mockLetterSend, async (request) => {
      const input = mockLetterSendRequestSchema.parse(request.body);
      requireProfileAccess(request, input.profileId, accessSecret());
      return simulateLetterSend(input, plans);
    });
  };
}
