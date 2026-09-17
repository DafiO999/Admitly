import { z } from 'zod';

export const diagnosisSchema = z.object({
  goalSummary: z.string(),
  strengths: z.array(z.string()),
  constraints: z.array(z.string()),
  focusNow: z.array(z.string()),
}).strict();

export type Diagnosis = z.infer<typeof diagnosisSchema>;

export const aiDiagnosisOutputSchema = z.object({
  goalSummary: z.string().trim().min(1).max(300),
  strengths: z.array(z.string().trim().min(1).max(300)).max(8),
  constraints: z.array(z.string().trim().min(1).max(300)).max(8),
  focusNow: z.array(z.string().trim().min(1).max(300)).max(8),
}).strict();
