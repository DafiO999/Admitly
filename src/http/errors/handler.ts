import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DatabaseUnavailableError, PlanConflictError } from '../../application/ports/plan-repository.js';
import { PersistedPlanNotFoundError } from '../../application/services/plan-persistence.js';
import { UniversityProviderError } from '../../application/ports/university-provider.js';
import { ComparisonUniversityNotFoundError } from '../../application/services/comparison.js';
import { RecommendationNotFoundError } from '../../application/services/recommendation-explanation.js';
import { RoadmapProgramMismatchError, RoadmapUniversityNotFoundError } from '../../application/services/roadmap.js';

type ErrorCode = 'VALIDATION' | 'REQUEST_TOO_LARGE' | 'NOT_FOUND' | 'CONFLICT'
  | 'EXTERNAL_UNAVAILABLE' | 'DATABASE_UNAVAILABLE' | 'INTERNAL';

function errorResponse(code: ErrorCode, message: string) {
  return { error: { code, message, details: [] } };
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const send = (status: number, code: ErrorCode, message: string) => {
      // Log only our fixed category and status. Error names, messages and request data are untrusted.
      request.log.error({ code, statusCode: status }, 'Request failed');
      return reply.status(status).send(errorResponse(code, message));
    };
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      && typeof error.statusCode === 'number' ? error.statusCode : undefined;
    const hasValidation = typeof error === 'object' && error !== null && 'validation' in error
      && Boolean(error.validation);

    if (error instanceof ZodError || hasValidation) {
      return send(400, 'VALIDATION', 'Invalid request');
    }

    if (statusCode === 413) {
      return send(413, 'REQUEST_TOO_LARGE', 'Request body too large');
    }

    if (error instanceof UniversityProviderError) {
      return send(error.code === 'CONFIGURATION' ? 503 : 502,
        'EXTERNAL_UNAVAILABLE', 'University data unavailable');
    }

    if (error instanceof DatabaseUnavailableError) {
      return send(503, 'DATABASE_UNAVAILABLE', 'Database unavailable');
    }

    if (error instanceof PlanConflictError) {
      return send(409, 'CONFLICT', 'Current plan changed; reload and retry');
    }

    if (error instanceof ComparisonUniversityNotFoundError || error instanceof RecommendationNotFoundError
      || error instanceof RoadmapUniversityNotFoundError || error instanceof PersistedPlanNotFoundError) {
      return send(404, 'NOT_FOUND', 'Not found');
    }

    if (error instanceof RoadmapProgramMismatchError) {
      return send(422, 'VALIDATION', 'Selected university has no matching bachelor program');
    }

    if (statusCode === 404) {
      return send(404, 'NOT_FOUND', 'Not found');
    }

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return send(statusCode, 'VALIDATION', 'Invalid request');
    }

    return send(500, 'INTERNAL', 'Internal server error');
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorResponse('NOT_FOUND', 'Not found'));
  });
}
