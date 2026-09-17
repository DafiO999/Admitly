import { z } from 'zod';
import { sourceStatusSchema, validateSource } from '../source.js';

export const roadmapItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  category: z.enum(['exam', 'document', 'application', 'academic', 'activity', 'research']),
  dueDate: z.iso.date().optional(),
  priority: z.number().int().nonnegative(),
  status: z.enum(['pending', 'in_progress', 'done', 'blocked']),
  dependsOnIds: z.array(z.string().min(1)),
  sourceUrl: z.url().optional(),
  sourceStatus: sourceStatusSchema.optional(),
  isNextAction: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.sourceStatus) validateSource({ sourceStatus: value.sourceStatus, sourceUrl: value.sourceUrl }, context);
  if (value.dueDate && (!value.sourceStatus || value.sourceStatus === 'unknown')) {
    context.addIssue({ code: 'custom', path: ['sourceStatus'], message: 'A due date requires source status' });
  }
});
export type RoadmapItem = z.infer<typeof roadmapItemSchema>;
