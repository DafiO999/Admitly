import type { FastifyPluginAsync } from 'fastify';
import type { UniversityContactRepository } from '../../application/ports/university-contact-repository.js';
import { resolveAdmissionsContact } from '../../application/services/admissions-contact.js';
import { apiPaths } from './paths.js';

export function admissionsContactRoutes(repositoryFactory: () => UniversityContactRepository): FastifyPluginAsync {
  return async (app) => {
    app.get<{ Params: { universityId: string } }>(apiPaths.admissionsContact, async (request) =>
      resolveAdmissionsContact(request.params.universityId, repositoryFactory));
  };
}
