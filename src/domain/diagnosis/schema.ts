import { z } from 'zod';

export const diagnosisSchema = z.object({
  goalSummary: z.string(),
  strengths: z.array(z.string()),
  constraints: z.array(z.string()),
  focusNow: z.array(z.string()),
}).strict();

export type Diagnosis = z.infer<typeof diagnosisSchema>;
