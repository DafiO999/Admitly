import type { UniversityProvider, UniversitySearchInput } from '../../application/ports/university-provider.js';
import type { University } from '../../domain/university/schema.js';
import { demoUniversities } from './fixtures.js';

export class DemoUniversityProvider implements UniversityProvider {
  async search(input: UniversitySearchInput): Promise<University[]> {
    return demoUniversities
      .filter((university) => !input.state || university.state === input.state)
      .filter((university) => !input.states?.length || (university.state !== undefined && input.states.includes(university.state)))
      .filter((university) => !input.field || university.programs.some((program) => program.field === input.field))
      .slice(0, input.limit ?? 20);
  }

  async getById(id: string): Promise<University | null> {
    return demoUniversities.find((university) => university.id === id) ?? null;
  }
}
