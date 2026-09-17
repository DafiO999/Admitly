import type { StudyField } from '../../domain/profile/schema.js';
import type { University } from '../../domain/university/schema.js';

export interface UniversitySearchInput {
  state?: string;
  field?: StudyField;
  limit?: number;
  year?: number;
}

export interface UniversityProvider {
  search(input: UniversitySearchInput): Promise<University[]>;
  getById(id: string): Promise<University | null>;
}

export type UniversityProviderErrorCode =
  | 'CONFIGURATION' | 'INVALID_REQUEST' | 'TIMEOUT' | 'UNAVAILABLE' | 'INVALID_RESPONSE';

export class UniversityProviderError extends Error {
  constructor(public readonly code: UniversityProviderErrorCode) {
    super(`University provider ${code.toLowerCase().replace('_', ' ')}`);
    this.name = 'UniversityProviderError';
  }
}
