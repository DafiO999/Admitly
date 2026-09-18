import { z } from 'zod';
import { sourceStatusSchema, validateSource } from '../source.js';

export const roadmapStatusSchema = z.enum(['pending', 'in_progress', 'done', 'blocked']);
export type RoadmapStatus = z.infer<typeof roadmapStatusSchema>;

export const roadmapLetterSchema = z.object({
  universityId: z.string().min(1), recipientEmail: z.email(), body: z.string().max(5000),
}).strict();
export type RoadmapLetter = z.infer<typeof roadmapLetterSchema>;

export const roadmapProgressSchema = z.object({
  done: z.number().int().nonnegative(), total: z.number().int().nonnegative(),
  percent: z.number().int().min(0).max(100),
}).strict();

export const roadmapItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1).optional(),
  category: z.enum(['exam', 'document', 'application', 'academic', 'activity', 'research', 'university_email']),
  dueDate: z.iso.date().optional(),
  priority: z.number().int().nonnegative(),
  status: roadmapStatusSchema,
  dependsOnIds: z.array(z.string().min(1)),
  sourceUrl: z.url().optional(),
  sourceStatus: sourceStatusSchema.optional(),
  isNextAction: z.boolean(),
  letter: roadmapLetterSchema.optional(),
}).strict().superRefine((value, context) => {
  if (value.letter && value.category !== 'university_email') {
    context.addIssue({ code: 'custom', path: ['letter'], message: 'Only email tasks may project a letter' });
  }
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
  progress: roadmapProgressSchema,
}).strict().superRefine((value, context) => {
  const ids = value.items.map((item) => item.id);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['items'], message: 'Roadmap item IDs must be unique' });
  }
  const nextItems = value.items.filter((item) => item.isNextAction);
  if (nextItems.length > 1 || nextItems[0]?.id !== (value.nextActionId ?? undefined)) {
    context.addIssue({ code: 'custom', path: ['nextActionId'], message: 'Next action must identify the marked item' });
  }
  if (JSON.stringify(value.progress) !== JSON.stringify(roadmapProgress(value.items))) {
    context.addIssue({ code: 'custom', path: ['progress'], message: 'Progress must match item statuses' });
  }
});
export type Roadmap = z.infer<typeof roadmapSchema>;

export function roadmapProgress(items: { status: RoadmapStatus }[]): z.infer<typeof roadmapProgressSchema> {
  const total = items.length;
  const done = items.filter((item) => item.status === 'done').length;
  return { done, total, percent: total === 0 ? 0 : Math.round(done * 100 / total) };
}
