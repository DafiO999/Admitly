import type { FastifyPluginAsync } from 'fastify';
import type { LetterDraftProvider } from '../../application/ports/letter-draft-provider.js';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import { prepareMockLetterDrafts, simulateLetterSend } from '../../application/services/mock-letter-send.js';
import { apiPaths } from './paths.js';

export function mockLetterSendRoutes(
  plans: () => PlanRepository,
  mode: () => 'mock' | 'smtp',
  drafts: () => LetterDraftProvider | null,
): FastifyPluginAsync {
  return async (app) => {
    app.get(apiPaths.letterDeliveryMode, async () => ({ mode: mode() }));
    app.post(apiPaths.mockLetterDrafts, async (request) =>
      prepareMockLetterDrafts(request.body, plans, drafts));
    app.post(apiPaths.mockLetterSend, async (request) => simulateLetterSend(request.body, plans));
  };
}
