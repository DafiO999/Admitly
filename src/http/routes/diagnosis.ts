import type { FastifyInstance } from 'fastify';
import type { AiProvider } from '../../application/ports/ai-provider.js';
import { createDiagnosis } from '../../application/services/diagnosis.js';
import { apiPaths } from './paths.js';

export function diagnosisRoutes(aiProviderFactory: () => AiProvider | null) {
  return async (app: FastifyInstance): Promise<void> => {
    app.post(apiPaths.diagnosis, async (request) => createDiagnosis(request.body, aiProviderFactory));
  };
}
