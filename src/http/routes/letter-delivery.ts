import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { FileStorage } from '../../application/ports/file-storage.js';
import type { LetterDeliveryRepository } from '../../application/ports/letter-delivery-repository.js';
import type { MailProvider } from '../../application/ports/mail-provider.js';
import { MailProviderUnavailableError } from '../../application/ports/mail-provider.js';
import type { UniversityContactRepository } from '../../application/ports/university-contact-repository.js';
import type { PlanRepository } from '../../application/ports/plan-repository.js';
import { getAdmissionLetter, prepareAdmissionLetter, sendAdmissionLetter } from '../../application/services/letter-delivery.js';
import { apiPaths } from './paths.js';
import { requireProfileAccess } from '../profile-access.js';

const emptyBody = z.object({}).strict();

export function letterDeliveryRoutes(
  contacts: () => UniversityContactRepository,
  delivery: () => LetterDeliveryRepository,
  storage: () => FileStorage,
  mail: () => MailProvider,
  limits: () => { maxFileBytes: number; maxTotalBytes: number },
  mode: () => 'mock' | 'smtp',
  plans: () => PlanRepository,
  accessSecret: () => string,
): FastifyPluginAsync {
  return async (app) => {
    const requireLetter = async (request: Parameters<typeof requireProfileAccess>[0], letterId: string) => {
      const profileId = await plans().findLetterProfileId(z.uuid().parse(letterId));
      if (profileId) requireProfileAccess(request, profileId, accessSecret());
    };
    app.post<{ Params: { letterId: string } }>(apiPaths.letterPrepare, async (request) => {
      await requireLetter(request, request.params.letterId);
      emptyBody.parse(request.body ?? {});
      return prepareAdmissionLetter(request.params.letterId, contacts, delivery, limits);
    });
    app.post<{ Params: { letterId: string } }>(apiPaths.letterSend, async (request) => {
      await requireLetter(request, request.params.letterId);
      if (mode() !== 'smtp') throw new MailProviderUnavailableError();
      emptyBody.parse(request.body ?? {});
      return sendAdmissionLetter(request.params.letterId, request.headers['idempotency-key'],
        contacts, delivery, storage, mail, limits);
    });
    app.get<{ Params: { letterId: string } }>(apiPaths.letter, async (request) => {
      await requireLetter(request, request.params.letterId);
      return getAdmissionLetter(request.params.letterId, delivery);
    });
  };
}
