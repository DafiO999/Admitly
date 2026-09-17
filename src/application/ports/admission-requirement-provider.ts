import type { AdmissionRequirement } from '../../domain/university/requirement.js';

export interface AdmissionRequirementProvider {
  listByUniversityIds(ids: string[]): Promise<AdmissionRequirement[]>;
}
