import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DatabaseUnavailableError } from '../../application/ports/plan-repository.js';
import { PersistedPlanNotFoundError } from '../../application/services/plan-persistence.js';
import { UniversityProviderError } from '../../application/ports/university-provider.js';
import { ComparisonUniversityNotFoundError } from '../../application/services/comparison.js';
import { RecommendationNotFoundError } from '../../application/services/recommendation-explanation.js';
import { RoadmapProgramMismatchError, RoadmapUniversityNotFoundError } from '../../application/services/roadmap.js';

type ErrorCode = 'VALIDATION' | 'NOT_FOUND' | 'EXTERNAL_UNAVAILABLE' | 'DATABASE_UNAVAILABLE' | 'INTERNAL';

function errorResponse(code: ErrorCode, message: string) {
  return { error: { code, message, details: [] } };
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    // Avoid logging arbitrary error messages, which may contain credentials.
    request.log.error({ errorName: error instanceof Error ? error.name : 'UnknownError' }, 'Request failed');
    const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
      && typeof error.statusCode === 'number' ? error.statusCode : undefined;
    const hasValidation = typeof error === 'object' && error !== null && 'validation' in error
      && Boolean(error.validation);

    if (error instanceof ZodError || hasValidation) {
      return reply.status(400).send(errorResponse('VALIDATION', 'Invalid request'));
    }

    if (error instanceof UniversityProviderError) {
      return reply.status(error.code === 'CONFIGURATION' ? 503 : 502)
        .send(errorResponse('EXTERNAL_UNAVAILABLE', 'University data unavailable'));
    }

    if (error instanceof DatabaseUnavailableError) {
      return reply.status(503).send(errorResponse('DATABASE_UNAVAILABLE', 'Database unavailable'));
    }

    if (error instanceof ComparisonUniversityNotFoundError || error instanceof RecommendationNotFoundError
      || error instanceof RoadmapUniversityNotFoundError || error instanceof PersistedPlanNotFoundError) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Not found'));
    }

    if (error instanceof RoadmapProgramMismatchError) {
      return reply.status(422).send(errorResponse('VALIDATION', 'Selected university has no matching bachelor program'));
    }

    if (statusCode === 404) {
      return reply.status(404).send(errorResponse('NOT_FOUND', 'Not found'));
    }

    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send(errorResponse('VALIDATION', 'Invalid request'));
    }

    return reply.status(500).send(errorResponse('INTERNAL', 'Internal server error'));
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send(errorResponse('NOT_FOUND', 'Not found'));
  });
}
