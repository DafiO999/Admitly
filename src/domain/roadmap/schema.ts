import { z } from 'zod';
import { sourceStatusSchema, validateSource } from '../source.js';

export const roadmapStatusSchema = z.enum(['pending', 'in_progress', 'done', 'blocked']);
export type RoadmapStatus = z.infer<typeof roadmapStatusSchema>;

export const roadmapItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  category: z.enum(['exam', 'document', 'application', 'academic', 'activity', 'research']),
  dueDate: z.iso.date().optional(),
  priority: z.number().int().nonnegative(),
  status: roadmapStatusSchema,
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

export const sourceCoverageSchema = z.object({
  official: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  demo: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
}).strict();
export type SourceCoverage = z.infer<typeof sourceCoverageSchema>;

export const roadmapSchema = z.object({
  rulesVersion: z.string().min(1),
  items: z.array(roadmapItemSchema),
  nextActionId: z.string().min(1).nullable(),
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Roadmap item IDs must be unique' });
  }
  const nextItems = value.items.filter((item) => item.isNextAction);
  if (nextItems.length > 1 || nextItems[0]?.id !== (value.nextActionId ?? undefined)) {
    context.addIssue({ code: 'custom', path: ['nextActionId'], message: 'Next action must identify the marked item' });
  }
});
export type Roadmap = z.infer<typeof roadmapSchema>;
