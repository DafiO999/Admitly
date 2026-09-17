import type { FastifyInstance } from 'fastify';
import { createDiagnosis } from '../../application/services/diagnosis.js';

export async function diagnosisRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/diagnosis', async (request) => createDiagnosis(request.body));
}
