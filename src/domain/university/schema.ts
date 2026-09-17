import { z } from 'zod';
import { studyFieldSchema } from '../profile/schema.js';
import { sourceStatusSchema, validateSource } from '../source.js';

export const programSummarySchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  field: studyFieldSchema,
  degree: z.literal('bachelor'),
  sourceStatus: sourceStatusSchema,
  sourceUrl: z.url().optional(),
}).strict().superRefine(validateSource);
export type ProgramSummary = z.infer<typeof programSummarySchema>;

export const universitySchema = z.object({
  id: z.string().min(1),
  provider: z.enum(['college_scorecard', 'curated', 'demo']),
  name: z.string().min(1),
  city: z.string().min(1).optional(),
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  websiteUrl: z.url().optional(),
  studentSize: z.number().int().nonnegative().optional(),
  admissionRate: z.number().min(0).max(1).optional(),
  tuitionOutOfStateUsd: z.number().int().nonnegative().optional(),
  averageNetPriceUsd: z.number().int().nonnegative().optional(),
  satMedian: z.number().int().min(400).max(1600).optional(),
  programs: z.array(programSummarySchema).min(1),
  dataYear: z.number().int().min(2000).max(2100).optional(),
  sourceUrl: z.url().optional(),
  sourceStatus: sourceStatusSchema,
}).strict().superRefine((value, context) => {
  validateSource(value, context);
  const keys = value.programs.map((program) => program.key);
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', path: ['programs'], message: 'Program keys must be unique' });
  }
});
export type University = z.infer<typeof universitySchema>;
