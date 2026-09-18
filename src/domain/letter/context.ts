import { createHash } from 'node:crypto';
import type { StudyField } from '../profile/schema.js';

export interface LetterUniversityContext {
  name: string;
  city?: string;
  state?: string;
  programs: { name: string; field: StudyField }[];
}

export function createLetterUniversityHash(university: LetterUniversityContext): string {
  const canonical = {
    name: university.name,
    city: university.city ?? null,
    state: university.state ?? null,
    programs: university.programs.map((program) => ({ name: program.name, field: program.field }))
      .sort((left, right) => left.field.localeCompare(right.field) || left.name.localeCompare(right.name)),
  };
  return createHash('sha256').update(`letter-university-v1:${JSON.stringify(canonical)}`).digest('hex');
}
