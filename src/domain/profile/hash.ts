import { createHash } from 'node:crypto';
import { PROFILE_HASH_VERSION } from '../versions.js';
import { studentProfileSchema } from './schema.js';

export function createProfileHash(input: unknown): string {
  const profile = studentProfileSchema.parse(input);
  const canonical = {
    targetCountry: profile.targetCountry,
    targetDegree: profile.targetDegree,
    targetField: profile.targetField,
    targetIntakeYear: profile.targetIntakeYear,
    studentStage: profile.studentStage,
    gpaValue: profile.gpaValue,
    gpaScale: profile.gpaScale,
    englishExam: profile.englishExam ?? null,
    sat: profile.sat ?? null,
    annualBudgetUsd: profile.annualBudgetUsd,
    preferredStates: [...new Set(profile.preferredStates ?? [])].sort(),
    campusSize: profile.campusSize ?? null,
  };
  return createHash('sha256')
    .update(`${PROFILE_HASH_VERSION}:${JSON.stringify(canonical)}`)
    .digest('hex');
}
