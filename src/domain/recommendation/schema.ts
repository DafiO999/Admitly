import { z } from 'zod';
import { universitySchema } from '../university/schema.js';

export const scoreComponentSchema = z.object({
  key: z.enum(['academic', 'program', 'budget', 'preferences']),
  score: z.number().int().nonnegative(),
  maxScore: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
}).strict().refine((component) => component.score <= component.maxScore, {
  path: ['score'], message: 'Score exceeds maximum',
});
export type ScoreComponent = z.infer<typeof scoreComponentSchema>;

export const recommendationExplanationSchema = z.object({
  summary: z.string().trim().min(1).max(300),
  reasons: z.array(z.string().trim().min(1).max(300)).max(4),
  concerns: z.array(z.string().trim().min(1).max(300)).max(4),
}).strict();
export type RecommendationExplanation = z.infer<typeof recommendationExplanationSchema>;

export const recommendationSchema = z.object({
  universityId: z.string().min(1),
  fitScore: z.number().int().min(0).max(100),
  components: z.array(scoreComponentSchema),
  reasonCodes: z.array(z.string()),
  concerns: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
  explanation: recommendationExplanationSchema.optional(),
}).strict();
export type Recommendation = z.infer<typeof recommendationSchema>;

export const recommendedUniversitySchema = z.object({
  ...recommendationSchema.shape,
  university: universitySchema,
}).strict();
export type RecommendedUniversity = z.infer<typeof recommendedUniversitySchema>;
