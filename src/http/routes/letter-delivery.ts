import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { FileStorage } from '../../application/ports/file-storage.js';
import type { LetterDeliveryRepository } from '../../application/ports/letter-delivery-repository.js';
import type { MailProvider } from '../../application/ports/mail-provider.js';
import { MailProviderUnavailableError } from '../../application/ports/mail-provider.js';
import type { UniversityContactRepository } from '../../application/ports/university-contact-repository.js';
import { getAdmissionLetter, prepareAdmissionLetter, sendAdmissionLetter } from '../../application/services/letter-delivery.js';
import { apiPaths } from './paths.js';

const emptyBody = z.object({}).strict();

export function letterDeliveryRoutes(
  contacts: () => UniversityContactRepository,
  delivery: () => LetterDeliveryRepository,
  storage: () => FileStorage,
  mail: () => MailProvider,
  limits: () => { maxFileBytes: number; maxTotalBytes: number },
  mode: () => 'mock' | 'smtp',
): FastifyPluginAsync {
  return async (app) => {
    app.post<{ Params: { letterId: string } }>(apiPaths.letterPrepare, async (request) => {
      emptyBody.parse(request.body ?? {});
      return prepareAdmissionLetter(request.params.letterId, contacts, delivery, limits);
    });
    app.post<{ Params: { letterId: string } }>(apiPaths.letterSend, async (request) => {
      if (mode() !== 'smtp') throw new MailProviderUnavailableError();
      emptyBody.parse(request.body ?? {});
      return sendAdmissionLetter(request.params.letterId, request.headers['idempotency-key'],
        contacts, delivery, storage, mail, limits);
    });
    app.get<{ Params: { letterId: string } }>(apiPaths.letter, async (request) =>
      getAdmissionLetter(request.params.letterId, delivery));
  };
}
