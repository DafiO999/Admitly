import { describe, expect, it, vi } from 'vitest';
import { createRecommendations } from '../../src/application/services/recommendations.js';
import type { UniversityProvider } from '../../src/application/ports/university-provider.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

describe('recommendation candidate search', () => {
  it('adds matching schools from preferred states to the national pool', async () => {
    const national = demoUniversities.find((item) => item.programs.some((program) => program.field === 'computer_science'))!;
    const local = { ...national, id: 'preferred-school', name: 'Preferred School', state: 'CA' };
    const search = vi.fn<UniversityProvider['search']>()
      .mockResolvedValueOnce([national])
      .mockResolvedValueOnce([local]);
    const provider: UniversityProvider = { search, getById: async () => null };

    const result = await createRecommendations({
      profile: { ...canonicalDemoProfile, preferredStates: ['CA'] },
    }, () => provider);

    expect(search).toHaveBeenNthCalledWith(1, { field: 'computer_science', limit: 100 });
    expect(search).toHaveBeenNthCalledWith(2, { field: 'computer_science', states: ['CA'], limit: 100 });
    expect(result.recommendations.map((item) => item.universityId)).toContain('preferred-school');
  });
});
