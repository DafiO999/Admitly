import type { AdmissionRequirementProvider } from '../application/ports/admission-requirement-provider.js';
import type { AdmissionRequirement } from '../domain/university/requirement.js';
import type { Environment } from '../config/env.js';
import { DemoAdmissionRequirementProvider } from './demo/admission-requirement-provider.js';

class UnknownAdmissionRequirementProvider implements AdmissionRequirementProvider {
  async listByUniversityIds(): Promise<AdmissionRequirement[]> {
    return [];
  }
}

export function createAdmissionRequirementProvider(
  env: Pick<Environment, 'DEMO_DATA_MODE'>,
): AdmissionRequirementProvider {
  return env.DEMO_DATA_MODE
    ? new DemoAdmissionRequirementProvider()
    : new UnknownAdmissionRequirementProvider();
}
