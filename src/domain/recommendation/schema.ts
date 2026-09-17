import { z } from 'zod';

export const scoreComponentSchema = z.object({
  key: z.enum(['academic', 'program', 'budget', 'preferences']),
  score: z.number().int().nonnegative(),
  maxScore: z.number().int().nonnegative(),
  reasons: z.array(z.string()),
}).strict().refine((component) => component.score <= component.maxScore, {
  path: ['score'], message: 'Score exceeds maximum',
});
export type ScoreComponent = z.infer<typeof scoreComponentSchema>;

export const recommendationSchema = z.object({
  universityId: z.string().min(1),
  fitScore: z.number().int().min(0).max(100),
  components: z.array(scoreComponentSchema),
  reasonCodes: z.array(z.string()),
  concerns: z.array(z.object({ code: z.string(), message: z.string() }).strict()),
  explanation: z.object({
    summary: z.string(),
    reasons: z.array(z.string()),
    concerns: z.array(z.string()),
  }).strict().optional(),
}).strict();
export type Recommendation = z.infer<typeof recommendationSchema>;
