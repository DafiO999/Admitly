import { z } from 'zod';
import { diagnoseProfile } from '../../domain/diagnosis/service.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';

const diagnosisRequestSchema = z.object({ profile: studentProfileSchema }).strict();

export function createDiagnosis(input: unknown) {
  const { profile } = diagnosisRequestSchema.parse(input);
  return { diagnosis: diagnoseProfile(profile), mode: 'rules' as const };
}
