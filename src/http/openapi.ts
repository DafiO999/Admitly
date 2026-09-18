import { z } from 'zod';
import { comparisonRequestSchema } from '../application/services/comparison.js';
import {
  mockLetterDraftsRequestSchema, mockLetterSendRequestSchema,
} from '../application/services/mock-letter-send.js';
import { diagnosisRequestSchema } from '../application/services/diagnosis.js';
import {
  recalculateRequestSchema, saveProfileRequestSchema, statusRequestSchema,
} from '../application/services/plan-persistence.js';
import { explanationRequestSchema } from '../application/services/recommendation-explanation.js';
import { recommendationRequestSchema } from '../application/services/recommendations.js';
import { roadmapRequestSchema } from '../application/services/roadmap.js';
import { createLetterRequestSchema, generateLetterDraftsRequestSchema, letterContentRequestSchema,
  letterPurposeSchema, letterStatusSchema, letterVariantTypeSchema } from '../domain/letter/schema.js';
import { attachmentMetadataSchema } from '../domain/letter/attachment.js';
import { diagnosisSchema } from '../domain/diagnosis/schema.js';
import { studentProfileSchema } from '../domain/profile/schema.js';
import { recommendationExplanationSchema, recommendationSchema, recommendedUniversitySchema } from '../domain/recommendation/schema.js';
import { roadmapSchema, sourceCoverageSchema } from '../domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../domain/university/requirement.js';
import { universitySchema } from '../domain/university/schema.js';
import { universityContactSchema } from '../domain/university/contact.js';
import { apiPaths } from './routes/paths.js';

const json = (schema: z.ZodType) => {
  const converted = z.toJSONSchema(schema, { io: 'input', reused: 'inline' });
  delete converted.$schema;
  return converted;
};

const errorSchema = z.object({
  error: z.object({
    code: z.enum(['VALIDATION', 'REQUEST_TOO_LARGE', 'NOT_FOUND', 'CONFLICT',
      'EXTERNAL_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'INTERNAL', 'UNIVERSITY_EMAIL_UNAVAILABLE',
      'LETTER_NOT_FOUND', 'LETTER_NOT_EDITABLE', 'INVALID_REPLY_TO', 'AI_DRAFT_GENERATION_FAILED',
      'UNSUPPORTED_ATTACHMENT_TYPE', 'ATTACHMENT_TOO_LARGE', 'LETTER_ATTACHMENT_TOTAL_LIMIT', 'INVALID_FILE',
      'LETTER_NOT_READY', 'LETTER_ALREADY_SENT', 'LETTER_SEND_IN_PROGRESS',
      'MAIL_PROVIDER_UNAVAILABLE', 'MAIL_SEND_FAILED']),
    message: z.string(),
    details: z.array(z.unknown()),
  }).strict(),
}).strict();
const diagnosisResponseSchema = z.object({
  diagnosis: diagnosisSchema, mode: z.enum(['rules', 'gemini']), promptVersion: z.string().optional(),
}).strict();
const recommendationsResponseSchema = z.object({
  engineVersion: z.string(), recommendations: z.array(recommendedUniversitySchema),
}).strict();
const explanationResponseSchema = z.object({
  universityId: z.string(), engineVersion: z.string(), explanation: recommendationExplanationSchema,
  mode: z.enum(['rules', 'gemini']), promptVersion: z.string().optional(),
}).strict();
const comparisonResponseSchema = z.object({
  engineVersion: z.string(),
  comparisons: z.array(z.object({
    university: universitySchema, recommendation: recommendationSchema.nullable(),
    requirements: z.array(admissionRequirementSchema), requirementsStatus: z.enum(['reported', 'unknown']),
  }).strict()),
}).strict();
const admissionsContactResponseSchema = z.object({
  contact: universityContactSchema.pick({
    universityId: true, kind: true, email: true, sourceUrl: true,
    sourceStatus: true, verifiedAt: true,
  }),
}).strict();
const letterRecordSchema = z.object({
  id: z.uuid(), profileId: z.uuid(), universityId: z.string(), universityContactId: z.uuid(),
  purpose: letterPurposeSchema, status: letterStatusSchema,
  senderName: z.string(), replyToEmail: z.email(),
  subject: z.string().nullable(), body: z.string().nullable(), selectedVariantId: z.uuid().nullable(),
  createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
}).strict();
const letterGenerationResponseSchema = z.object({
  generationId: z.uuid(), promptVersion: z.string(),
  variants: z.array(z.object({
    id: z.uuid(), variant: letterVariantTypeSchema, subject: z.string(), body: z.string(),
  }).strict()).length(3),
}).strict();
const letterGenerationMetadataSchema = z.object({
  id: z.uuid(), promptVersion: z.string(), createdAt: z.iso.datetime(),
  variants: z.array(z.object({ id: z.uuid(), variant: letterVariantTypeSchema,
    createdAt: z.iso.datetime() }).strict()),
}).strict();
const letterDeliveryStateSchema = z.object({
  state: z.enum(['not_sent', 'started', 'accepted', 'failed', 'ambiguous']),
  recipientEmail: z.email().optional(), providerMessageId: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(), createdAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().nullable().optional(),
}).strict();
const roadmapResponseSchema = z.object({
  roadmap: roadmapSchema, sourceCoverage: sourceCoverageSchema,
  mode: z.enum(['rules', 'gemini']), promptVersion: z.string().optional(),
}).strict();
const persistedRoadmapSchema = roadmapSchema.safeExtend({
  id: z.uuid(), selectedUniversityIds: z.array(z.string()),
});
const persistedPlanSchema = z.object({
  profile: studentProfileSchema.safeExtend({ id: z.uuid() }),
  profileHash: z.string(),
  recommendationRun: z.object({
    id: z.uuid(), engineVersion: z.string(), recommendations: z.array(recommendedUniversitySchema),
    promptVersions: z.object({
      diagnosis: z.string(), recommendationExplanation: z.string(), roadmap: z.string(),
    }).strict().optional(),
  }).strict(),
  roadmap: persistedRoadmapSchema,
  sourceCoverage: sourceCoverageSchema,
}).strict();

const schemas = {
  Error: errorSchema,
  HealthResponse: z.object({ status: z.literal('ok') }),
  ReadyResponse: z.object({ status: z.literal('ready') }),
  DiagnosisRequest: diagnosisRequestSchema,
  DiagnosisResponse: diagnosisResponseSchema,
  RecommendationsRequest: recommendationRequestSchema,
  RecommendationsResponse: recommendationsResponseSchema,
  ExplanationRequest: explanationRequestSchema,
  ExplanationResponse: explanationResponseSchema,
  ComparisonRequest: comparisonRequestSchema,
  ComparisonResponse: comparisonResponseSchema,
  AdmissionsContactResponse: admissionsContactResponseSchema,
  LetterDeliveryModeResponse: z.object({ mode: z.enum(['mock', 'smtp']) }).strict(),
  MockLetterDraftsRequest: mockLetterDraftsRequestSchema,
  MockLetterDraftsResponse: z.object({
    variants: z.array(z.object({
      id: z.uuid(), variant: letterVariantTypeSchema, subject: z.string(), body: z.string(),
    }).strict()).length(3),
  }).strict(),
  MockLetterSendRequest: mockLetterSendRequestSchema,
  MockLetterSendResponse: z.object({
    status: z.literal('simulated'), simulationId: z.uuid(), universityId: z.string(),
    universityName: z.string(), subject: z.string(),
  }).strict(),
  CreateLetterRequest: createLetterRequestSchema,
  CreateLetterResponse: z.object({ letter: letterRecordSchema, recipientEmail: z.email() }).strict(),
  LetterDraftsRequest: generateLetterDraftsRequestSchema,
  LetterDraftsResponse: letterGenerationResponseSchema,
  LetterContentRequest: letterContentRequestSchema,
  LetterContentResponse: z.object({ letter: letterRecordSchema }).strict(),
  AttachmentUploadResponse: z.object({ attachment: attachmentMetadataSchema }).strict(),
  AttachmentListResponse: z.object({ attachments: z.array(attachmentMetadataSchema) }).strict(),
  AttachmentDeleteResponse: z.object({ deleted: z.literal(true) }).strict(),
  LetterPrepareResponse: z.object({ letter: letterRecordSchema, recipientEmail: z.email() }).strict(),
  LetterSendResponse: z.object({
    letter: z.object({ id: z.uuid(), status: z.literal('sent'), recipientEmail: z.email(),
      sentAt: z.iso.datetime() }).strict(),
    delivery: z.object({ state: z.literal('accepted'), providerMessageId: z.string().nullable() }).strict(),
  }).strict(),
  LetterDetailResponse: z.object({
    letter: letterRecordSchema, generations: z.array(letterGenerationMetadataSchema),
    attachments: z.array(attachmentMetadataSchema), delivery: letterDeliveryStateSchema,
  }).strict(),
  RoadmapRequest: roadmapRequestSchema,
  RoadmapResponse: roadmapResponseSchema,
  SaveProfileRequest: saveProfileRequestSchema,
  RecalculateRequest: recalculateRequestSchema,
  StatusRequest: statusRequestSchema,
  PersistedPlanResponse: persistedPlanSchema,
  UpdateRoadmapItemResponse: z.object({ roadmap: persistedRoadmapSchema }).strict(),
};

type SchemaName = keyof typeof schemas;
const ref = (name: SchemaName) => ({ $ref: `#/components/schemas/${name}` });

function operation(
  operationId: string, summary: string, response: SchemaName,
  request?: SchemaName, params: string[] = [], errors: number[] = [],
) {
  return {
    operationId,
    summary,
    ...(params.length ? { parameters: params.map((name) => ({
      name, in: 'path', required: true,
      schema: json(name === 'profileId' || name === 'roadmapId' || name === 'letterId'
        || name === 'attachmentId' ? z.uuid() : z.string().min(1)),
    })) } : {}),
    ...(request ? { requestBody: {
      required: true, content: { 'application/json': { schema: ref(request) } },
    } } : {}),
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: ref(response) } } },
      default: { description: 'Unexpected error', content: { 'application/json': { schema: ref('Error') } } },
      ...Object.fromEntries(errors.map((status) => [String(status), {
        description: 'Error', content: { 'application/json': { schema: ref('Error') } },
      }])),
    },
  };
}

const path = (route: string) => route.replace(/:([A-Za-z][A-Za-z0-9]*)/g, '{$1}');

export function generateOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: { title: 'Admitly backend API', version: '1.0.0',
      description: 'Fit scores describe profile match, not admission probability. Demo source data is fictional.' },
    components: { schemas: Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, json(schema)])) },
    paths: {
      [path(apiPaths.health)]: { get: operation('getHealth', 'Liveness', 'HealthResponse') },
      [path(apiPaths.ready)]: { get: operation('getReady', 'Database readiness',
        'ReadyResponse', undefined, [], [503]) },
      [path(apiPaths.diagnosis)]: { post: operation('createDiagnosis', 'Diagnose a profile',
        'DiagnosisResponse', 'DiagnosisRequest', [], [400, 413, 500]) },
      [path(apiPaths.recommendations)]: { post: operation('createRecommendations', 'Rank universities',
        'RecommendationsResponse', 'RecommendationsRequest', [], [400, 413, 502, 503]) },
      [path(apiPaths.recommendationExplanation)]: { post: operation('explainRecommendation', 'Explain one recommendation',
        'ExplanationResponse', 'ExplanationRequest', ['universityId'], [400, 404, 413, 502, 503]) },
      [path(apiPaths.comparison)]: { post: operation('compareUniversities', 'Compare two or three universities',
        'ComparisonResponse', 'ComparisonRequest', [], [400, 404, 413, 502, 503]) },
      [path(apiPaths.admissionsContact)]: { get: operation('getAdmissionsContact',
        'Get an active verified admissions contact', 'AdmissionsContactResponse',
        undefined, ['universityId'], [400, 404, 503]) },
      [path(apiPaths.letterDeliveryMode)]: { get: operation('getLetterDeliveryMode',
        'Get the configured letter delivery mode', 'LetterDeliveryModeResponse') },
      [path(apiPaths.mockLetterDrafts)]: { post: operation('prepareMockLetterDrafts',
        'Generate three grounded Gemini letter variants without persisting a message',
        'MockLetterDraftsResponse', 'MockLetterDraftsRequest', [], [400, 404, 413, 422, 502, 503]) },
      [path(apiPaths.mockLetterSend)]: { post: operation('simulateLetterSend',
        'Simulate a letter send without delivering or persisting a message',
        'MockLetterSendResponse', 'MockLetterSendRequest', [], [400, 404, 413, 503]) },
      [path(apiPaths.createLetter)]: { post: operation('createAdmissionLetter',
        'Create an admission letter', 'CreateLetterResponse', 'CreateLetterRequest',
        ['universityId'], [400, 404, 413, 503]) },
      [path(apiPaths.letterDrafts)]: { post: operation('generateAdmissionLetterDrafts',
        'Generate three grounded letter drafts', 'LetterDraftsResponse', 'LetterDraftsRequest',
        ['letterId'], [400, 404, 409, 413, 502, 503]) },
      [path(apiPaths.letterContent)]: { put: operation('selectAdmissionLetterContent',
        'Select and edit final letter content', 'LetterContentResponse', 'LetterContentRequest',
        ['letterId'], [400, 404, 409, 413, 503]) },
      [path(apiPaths.letterAttachments)]: {
        post: {
          ...operation('uploadLetterAttachment', 'Upload one private letter attachment',
            'AttachmentUploadResponse', undefined, ['letterId'], [400, 404, 409, 413, 415, 503]),
          requestBody: { required: true, content: { 'multipart/form-data': { schema: {
            type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } },
          } } } },
        },
        get: operation('listLetterAttachments', 'List letter attachment metadata',
          'AttachmentListResponse', undefined, ['letterId'], [400, 404, 503]),
      },
      [path(apiPaths.letterAttachment)]: { delete: operation('deleteLetterAttachment',
        'Delete one private letter attachment', 'AttachmentDeleteResponse', undefined,
        ['letterId', 'attachmentId'], [400, 404, 409, 503]) },
      [path(apiPaths.letterPrepare)]: { post: operation('prepareAdmissionLetter',
        'Validate and prepare an admission letter for sending', 'LetterPrepareResponse', undefined,
        ['letterId'], [400, 404, 409, 503]) },
      [path(apiPaths.letterSend)]: { post: {
        ...operation('sendAdmissionLetter', 'Send a prepared admission letter',
          'LetterSendResponse', undefined, ['letterId'], [400, 404, 409, 502, 503]),
        parameters: [
          { name: 'letterId', in: 'path', required: true, schema: json(z.uuid()) },
          { name: 'Idempotency-Key', in: 'header', required: true,
            schema: { type: 'string', minLength: 1, maxLength: 128 } },
        ],
      } },
      [path(apiPaths.letter)]: { get: operation('getAdmissionLetter',
        'Get letter content, attachment metadata and delivery state', 'LetterDetailResponse', undefined,
        ['letterId'], [400, 404, 503]) },
      [path(apiPaths.roadmap)]: { post: operation('createRoadmap', 'Build a roadmap',
        'RoadmapResponse', 'RoadmapRequest', [], [400, 404, 413, 422, 502, 503]) },
      [path(apiPaths.profile)]: { put: operation('saveProfile', 'Save a profile and plan',
        'PersistedPlanResponse', 'SaveProfileRequest', [], [400, 413, 502, 503]) },
      [path(apiPaths.plan)]: { get: operation('getPlan', 'Read the current saved plan',
        'PersistedPlanResponse', undefined, ['profileId'], [400, 404, 503]) },
      [path(apiPaths.recalculate)]: { post: operation('recalculatePlan', 'Recalculate a saved plan',
        'PersistedPlanResponse', 'RecalculateRequest', [], [400, 404, 409, 413, 502, 503]) },
      [path(apiPaths.roadmapItem)]: { patch: operation('updateRoadmapItem', 'Update one roadmap item status',
        'UpdateRoadmapItemResponse', 'StatusRequest',
        ['roadmapId', 'itemId'], [400, 404, 413, 503]) },
    },
  };
}
