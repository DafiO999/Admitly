import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { DatabaseUnavailableError, PlanConflictError } from '../../application/ports/plan-repository.js';
import { PersistedPlanNotFoundError } from '../../application/services/plan-persistence.js';
import { UniversityProviderError } from '../../application/ports/university-provider.js';
import { ComparisonUniversityNotFoundError } from '../../application/services/comparison.js';
import { RecommendationNotFoundError } from '../../application/services/recommendation-explanation.js';
import { RoadmapProgramMismatchError, RoadmapUniversityNotFoundError } from '../../application/services/roadmap.js';
import { UniversityEmailUnavailableError } from '../../application/services/admissions-contact.js';
import { LetterDraftSupersededError, LetterNotEditableError, LetterNotFoundError,
  LetterVariantNotFoundError } from '../../application/ports/letter-repository.js';
import { AiDraftGenerationFailedError, InvalidReplyToError } from '../../application/services/letters.js';
import {
  AttachmentNotFoundError, AttachmentTooLargeError, InvalidFileError,
  LetterAttachmentTotalLimitError, UnsupportedAttachmentTypeError,
} from '../../application/ports/letter-attachment-repository.js';
import {
  LetterAlreadySentError, LetterNotReadyError, LetterSendInProgressError,
} from '../../application/ports/letter-delivery-repository.js';
import { MailDeliveryError, MailProviderUnavailableError } from '../../application/ports/mail-provider.js';
import { ProfileAccessDeniedError } from '../profile-access.js';

type ErrorCode = 'VALIDATION' | 'REQUEST_TOO_LARGE' | 'NOT_FOUND' | 'CONFLICT'
  | 'EXTERNAL_UNAVAILABLE' | 'DATABASE_UNAVAILABLE' | 'INTERNAL' | 'UNIVERSITY_EMAIL_UNAVAILABLE'
  | 'LETTER_NOT_FOUND' | 'LETTER_NOT_EDITABLE' | 'INVALID_REPLY_TO' | 'AI_DRAFT_GENERATION_FAILED'
  | 'UNSUPPORTED_ATTACHMENT_TYPE' | 'ATTACHMENT_TOO_LARGE' | 'LETTER_ATTACHMENT_TOTAL_LIMIT' | 'INVALID_FILE'
  | 'LETTER_NOT_READY' | 'LETTER_ALREADY_SENT' | 'LETTER_SEND_IN_PROGRESS'
  | 'MAIL_PROVIDER_UNAVAILABLE' | 'MAIL_SEND_FAILED' | 'UNAUTHORIZED';

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

    if (error instanceof ProfileAccessDeniedError) {
      return send(401, 'UNAUTHORIZED', 'Profile access denied');
    }

    if (error instanceof UniversityProviderError) {
      return send(error.code === 'CONFIGURATION' ? 503 : 502,
        'EXTERNAL_UNAVAILABLE', 'University data unavailable');
    }

    if (error instanceof DatabaseUnavailableError) {
      return send(503, 'DATABASE_UNAVAILABLE', 'Database unavailable');
    }

    if (error instanceof UniversityEmailUnavailableError) {
      return send(404, 'UNIVERSITY_EMAIL_UNAVAILABLE', 'University admissions email unavailable');
    }

    if (error instanceof LetterNotFoundError || error instanceof LetterVariantNotFoundError) {
      return send(404, 'LETTER_NOT_FOUND', 'Letter or variant not found');
    }

    if (error instanceof AttachmentNotFoundError) {
      return send(404, 'NOT_FOUND', 'Attachment not found');
    }

    if (error instanceof UnsupportedAttachmentTypeError) {
      return send(415, 'UNSUPPORTED_ATTACHMENT_TYPE', 'Unsupported attachment type');
    }

    if (error instanceof AttachmentTooLargeError) {
      return send(413, 'ATTACHMENT_TOO_LARGE', 'Attachment too large');
    }

    if (error instanceof LetterAttachmentTotalLimitError) {
      return send(413, 'LETTER_ATTACHMENT_TOTAL_LIMIT', 'Letter attachment total limit exceeded');
    }

    if (error instanceof InvalidFileError) {
      return send(400, 'INVALID_FILE', 'Invalid attachment');
    }

    if (error instanceof LetterNotEditableError || error instanceof LetterDraftSupersededError) {
      return send(409, 'LETTER_NOT_EDITABLE', 'Letter is not editable');
    }

    if (error instanceof LetterNotReadyError) {
      return send(409, 'LETTER_NOT_READY', 'Letter is not ready to send');
    }

    if (error instanceof LetterAlreadySentError) {
      return send(409, 'LETTER_ALREADY_SENT', 'Letter already sent');
    }

    if (error instanceof LetterSendInProgressError) {
      return send(409, 'LETTER_SEND_IN_PROGRESS', 'Letter send in progress or outcome unknown');
    }

    if (error instanceof MailProviderUnavailableError) {
      return send(503, 'MAIL_PROVIDER_UNAVAILABLE', 'Mail provider unavailable');
    }

    if (error instanceof MailDeliveryError) {
      return send(502, 'MAIL_SEND_FAILED', error.state === 'ambiguous'
        ? 'Mail delivery outcome unknown; do not retry automatically' : 'Mail delivery failed');
    }

    if (error instanceof InvalidReplyToError) {
      return send(400, 'INVALID_REPLY_TO', 'Invalid reply-to email');
    }

    if (error instanceof AiDraftGenerationFailedError) {
      return send(error.unavailable ? 503 : 502, 'AI_DRAFT_GENERATION_FAILED', 'AI draft generation failed');
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
