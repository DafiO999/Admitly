import { z } from 'zod';
import { sourceStatusSchema, validateSource } from '../source.js';

export const admissionRequirementSchema = z.object({
  id: z.string().min(1),
  universityId: z.string().min(1),
  programKey: z.string().min(1).optional(),
  kind: z.enum(['application_deadline', 'english', 'sat_act', 'document', 'gpa', 'other']),
  label: z.string().min(1),
  valueText: z.string().min(1),
  numericValue: z.number().finite().optional(),
  date: z.iso.date().optional(),
  sourceUrl: z.url().optional(),
  sourceTitle: z.string().min(1).optional(),
  sourceStatus: sourceStatusSchema,
  checkedAt: z.iso.datetime().optional(),
}).strict().superRefine((value, context) => {
  validateSource(value, context);
  if (value.date && value.sourceStatus === 'unknown') {
    context.addIssue({ code: 'custom', path: ['sourceStatus'], message: 'A dated requirement needs source status' });
  }
});
export type AdmissionRequirement = z.infer<typeof admissionRequirementSchema>;
