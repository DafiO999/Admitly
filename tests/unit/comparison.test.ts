import { describe, expect, it } from 'vitest';
import type { AdmissionRequirementProvider } from '../../src/application/ports/admission-requirement-provider.js';
import type { UniversityProvider } from '../../src/application/ports/university-provider.js';
import { createComparison } from '../../src/application/services/comparison.js';
import { rankUniversities } from '../../src/domain/recommendation/engine.js';
import { universitySchema } from '../../src/domain/university/schema.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { DemoAdmissionRequirementProvider } from '../../src/infrastructure/demo/admission-requirement-provider.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';

const demoProviders = () => ({
  universityProvider: new DemoUniversityProvider(),
  requirementProvider: new DemoAdmissionRequirementProvider(),
});

describe('comparison service', () => {
  it('preserves selected order and reuses the recommendation engine scores', async () => {
    const ids = ['demo-gulf-metropolitan', 'demo-redwood-state'];
    const result = await createComparison({ profile: canonicalDemoProfile, universityIds: ids }, demoProviders);
    const expected = rankUniversities(canonicalDemoProfile, demoUniversities)
      .filter((item) => ids.includes(item.universityId));

    expect(result.engineVersion).toBe('1.0.0');
    expect(result.comparisons.map((item) => item.university.id)).toEqual(ids);
    for (const item of result.comparisons) {
      const ranked = expected.find((candidate) => candidate.universityId === item.university.id)!;
      expect(item.recommendation?.fitScore).toBe(ranked.fitScore);
      expect(item.recommendation?.components).toEqual(ranked.components);
      expect(item.requirementsStatus).toBe('reported');
      expect(item.requirements).toHaveLength(2);
      expect(item.requirements.every((requirement) => requirement.sourceStatus === 'demo')).toBe(true);
    }
  });

  it('keeps missing metrics and requirements unknown', async () => {
    const sparse = universitySchema.parse({
      id: 'sparse', provider: 'curated', name: 'Sparse College',
      programs: [{ key: 'cs', name: 'Computer Science', field: 'computer_science', degree: 'bachelor', sourceStatus: 'unknown' }],
      sourceStatus: 'unknown',
    });
    const providers = () => ({
      universityProvider: {
        search: async () => [sparse],
        getById: async (id: string) => id === 'sparse' ? sparse : demoUniversities.find((item) => item.id === id) ?? null,
      } satisfies UniversityProvider,
      requirementProvider: { listByUniversityIds: async () => [] } satisfies AdmissionRequirementProvider,
    });
    const result = await createComparison({
      profile: canonicalDemoProfile, universityIds: ['sparse', 'demo-redwood-state'],
    }, providers);
    const item = result.comparisons[0]!;
    expect(item.university).not.toHaveProperty('tuitionOutOfStateUsd');
    expect(item.university.sourceStatus).toBe('unknown');
    expect(item.requirements).toEqual([]);
    expect(item.requirementsStatus).toBe('unknown');
    expect(item.recommendation?.concerns.map((concern) => concern.code)).toContain('COST_UNKNOWN');
  });

  it('does not create a fit score for a school without the target program', async () => {
    const result = await createComparison({
      profile: canonicalDemoProfile, universityIds: ['demo-prairie-college', 'demo-redwood-state'],
    }, demoProviders);
    expect(result.comparisons[0]?.recommendation).toBeNull();
    expect(result.comparisons[1]?.recommendation).not.toBeNull();
  });

  it('does not attach requirements for a different program', async () => {
    const result = await createComparison({
      profile: canonicalDemoProfile, universityIds: ['demo-redwood-state', 'demo-gulf-metropolitan'],
    }, () => ({
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: {
        listByUniversityIds: async () => [{
          id: 'engineering-only', universityId: 'demo-redwood-state', programKey: 'engineering',
          kind: 'document', label: 'Engineering portfolio', valueText: 'Demo requirement', sourceStatus: 'demo',
        }],
      },
    }));
    expect(result.comparisons[0]?.requirements).toEqual([]);
    expect(result.comparisons[0]?.requirementsStatus).toBe('unknown');
  });

  it('requires source metadata for a verified deadline', async () => {
    const validDeadline = {
      id: 'official-deadline', universityId: 'demo-redwood-state', kind: 'application_deadline' as const,
      label: 'Official deadline', valueText: 'Apply by January 15', date: '2028-01-15',
      sourceStatus: 'official' as const, sourceUrl: 'https://example.edu/admissions',
    };
    const providers = (deadline: typeof validDeadline) => () => ({
      universityProvider: new DemoUniversityProvider(),
      requirementProvider: {
        listByUniversityIds: async () => [deadline],
      } satisfies AdmissionRequirementProvider,
    });
    const input = {
      profile: canonicalDemoProfile, universityIds: ['demo-redwood-state', 'demo-gulf-metropolitan'],
    };
    const valid = await createComparison(input, providers(validDeadline));
    expect(valid.comparisons[0]?.requirements[0]?.sourceUrl).toBe('https://example.edu/admissions');
    const invalid = { ...validDeadline, sourceUrl: undefined } as never;
    await expect(createComparison(input, providers(invalid))).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});
