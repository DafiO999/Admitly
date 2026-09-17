import type { AdmissionRequirementProvider } from '../../application/ports/admission-requirement-provider.js';
import type { AdmissionRequirement } from '../../domain/university/requirement.js';
import { demoRequirements } from './fixtures.js';

export class DemoAdmissionRequirementProvider implements AdmissionRequirementProvider {
  async listByUniversityIds(ids: string[]): Promise<AdmissionRequirement[]> {
    const selected = new Set(ids);
    return demoRequirements.filter((requirement) => selected.has(requirement.universityId));
  }
}
