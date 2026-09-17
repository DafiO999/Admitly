import { z } from 'zod';
import { comparisonRequestSchema } from '../application/services/comparison.js';
import { diagnosisRequestSchema } from '../application/services/diagnosis.js';
import {
  recalculateRequestSchema, saveProfileRequestSchema, statusRequestSchema,
} from '../application/services/plan-persistence.js';
import { explanationRequestSchema } from '../application/services/recommendation-explanation.js';
import { recommendationRequestSchema } from '../application/services/recommendations.js';
import { roadmapRequestSchema } from '../application/services/roadmap.js';
import { diagnosisSchema } from '../domain/diagnosis/schema.js';
import { studentProfileSchema } from '../domain/profile/schema.js';
import { recommendationExplanationSchema, recommendationSchema, recommendedUniversitySchema } from '../domain/recommendation/schema.js';
import { roadmapSchema, sourceCoverageSchema } from '../domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../domain/university/requirement.js';
import { universitySchema } from '../domain/university/schema.js';
import { apiPaths } from './routes/paths.js';

const json = (schema: z.ZodType) => {
  const converted = z.toJSONSchema(schema, { io: 'input', reused: 'inline' });
  delete converted.$schema;
  return converted;
};

const errorSchema = z.object({
  error: z.object({
    code: z.enum(['VALIDATION', 'REQUEST_TOO_LARGE', 'NOT_FOUND', 'CONFLICT',
      'EXTERNAL_UNAVAILABLE', 'DATABASE_UNAVAILABLE', 'INTERNAL']),
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
      schema: json(name === 'profileId' || name === 'roadmapId' ? z.uuid() : z.string().min(1)),
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
