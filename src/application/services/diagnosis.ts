import { z } from 'zod';
import type { AiProvider } from '../ports/ai-provider.js';
import { isGroundedWording } from './ai-guard.js';
import { diagnoseProfile } from '../../domain/diagnosis/service.js';
import { aiDiagnosisOutputSchema, type Diagnosis } from '../../domain/diagnosis/schema.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { DIAGNOSIS_PROMPT_VERSION } from '../../domain/versions.js';

export const diagnosisRequestSchema = z.object({
  profile: studentProfileSchema,
  enhanceWithAi: z.boolean().optional(),
}).strict();

function diagnosisSentences(diagnosis: Diagnosis): string[] {
  return [diagnosis.goalSummary, ...diagnosis.strengths, ...diagnosis.constraints, ...diagnosis.focusNow];
}

export async function createDiagnosis(input: unknown, aiProviderFactory: () => AiProvider | null) {
  const { profile, enhanceWithAi } = diagnosisRequestSchema.parse(input);
  const diagnosis = diagnoseProfile(profile);
  const fallback = { diagnosis, mode: 'rules' as const };
  if (!enhanceWithAi) return fallback;

  try {
    const provider = aiProviderFactory();
    if (!provider) return fallback;
    const candidate = aiDiagnosisOutputSchema.safeParse(await provider.enhanceDiagnosis(diagnosis));
    if (!candidate.success || candidate.data.strengths.length !== diagnosis.strengths.length
      || candidate.data.constraints.length !== diagnosis.constraints.length
      || candidate.data.focusNow.length !== diagnosis.focusNow.length
      || !isGroundedWording(diagnosisSentences(candidate.data), diagnosisSentences(diagnosis))) {
      return fallback;
    }
    return { diagnosis: candidate.data, mode: 'gemini' as const, promptVersion: DIAGNOSIS_PROMPT_VERSION };
  } catch {
    return fallback;
  }
}
