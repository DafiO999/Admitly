import { z } from 'zod';

export const studyFieldSchema = z.enum([
  'computer_science', 'engineering', 'business', 'economics', 'design', 'other',
]);
export type StudyField = z.infer<typeof studyFieldSchema>;

export const gpaScaleSchema = z.union([z.literal(4), z.literal(5), z.literal(10), z.literal(100)]);
export type GpaScale = z.infer<typeof gpaScaleSchema>;

export const examStatusSchema = z.enum(['not_planned', 'planned', 'taken']);
export type ExamStatus = z.infer<typeof examStatusSchema>;

export const studentStageSchema = z.enum(['grade_9_10', 'grade_11', 'grade_12', 'graduated']);
export type StudentStage = z.infer<typeof studentStageSchema>;

const englishExamSchema = z.object({
  type: z.enum(['IELTS', 'TOEFL', 'DUOLINGO']),
  status: examStatusSchema,
  score: z.number().finite().optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'taken' && value.score === undefined) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'A taken exam requires a score' });
  }
  if (value.status !== 'taken' && value.score !== undefined) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'Only a taken exam may have a score' });
  }
  if (value.score !== undefined) {
    const bounds = { IELTS: [0, 9], TOEFL: [0, 120], DUOLINGO: [10, 160] }[value.type];
    if (value.score < bounds[0]! || value.score > bounds[1]!) {
      context.addIssue({ code: 'custom', path: ['score'], message: 'Score is outside the exam range' });
    }
  }
});

const satSchema = z.object({
  status: examStatusSchema,
  score: z.number().int().min(400).max(1600).optional(),
}).strict().superRefine((value, context) => {
  if (value.status === 'taken' && value.score === undefined) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'A taken SAT requires a score' });
  }
  if (value.status !== 'taken' && value.score !== undefined) {
    context.addIssue({ code: 'custom', path: ['score'], message: 'Only a taken SAT may have a score' });
  }
});

export const studentProfileSchema = z.object({
  id: z.uuid().optional(),
  targetCountry: z.literal('US'),
  targetDegree: z.literal('bachelor'),
  targetField: studyFieldSchema,
  targetIntakeYear: z.number().int().min(2020).max(2100),
  studentStage: studentStageSchema.default('grade_11'),
  gpaValue: z.number().finite().min(0),
  gpaScale: gpaScaleSchema,
  englishExam: englishExamSchema.optional(),
  sat: satSchema.optional(),
  annualBudgetUsd: z.number().int().min(0),
  preferredStates: z.array(z.string().regex(/^[A-Z]{2}$/)).max(10).optional(),
  campusSize: z.enum(['small', 'medium', 'large', 'any']).optional(),
}).strict().superRefine((value, context) => {
  if (value.gpaValue > value.gpaScale) {
    context.addIssue({ code: 'custom', path: ['gpaValue'], message: 'GPA exceeds its scale' });
  }
});

export type StudentProfile = z.infer<typeof studentProfileSchema>;
