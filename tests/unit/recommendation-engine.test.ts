import { describe, expect, it } from 'vitest';
import { rankUniversities, scoreBudget } from '../../src/domain/recommendation/engine.js';
import { recommendedUniversitySchema } from '../../src/domain/recommendation/schema.js';
import { MAX_RECOMMENDATIONS, RECOMMENDATION_WEIGHTS } from '../../src/domain/recommendation/weights.js';
import { universitySchema } from '../../src/domain/university/schema.js';
import { canonicalDemoProfile, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

function componentScore(result: ReturnType<typeof rankUniversities>[number], key: string): number {
  return result.components.find((component) => component.key === key)!.score;
}

describe('recommendation engine', () => {
  it('returns 3–5 valid, bounded and explainable recommendations for the canonical profile', () => {
    const results = rankUniversities(canonicalDemoProfile, demoUniversities);
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.every((result) => recommendedUniversitySchema.safeParse(result).success)).toBe(true);
    expect(results.every((result) => result.fitScore >= 0 && result.fitScore <= 100)).toBe(true);
    expect(results.every((result) => result.components.reduce((sum, item) => sum + item.score, 0) === result.fitScore)).toBe(true);
    expect(results.every((result) => result.reasonCodes.includes('PROGRAM_EXACT_MATCH'))).toBe(true);
    expect(results.every((result) => result.university.programs.some((program) => program.field === 'computer_science'))).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/admissionProbability|admission_probability/);
    expect(Object.values(RECOMMENDATION_WEIGHTS).reduce((sum, weight) => sum + weight, 0)).toBe(100);
  });

  it('uses the specified budget bands at their exact boundaries', () => {
    expect(scoreBudget(25_000, 25_000)).toBe(25);
    expect(scoreBudget(25_000, 28_750)).toBe(20);
    expect(scoreBudget(25_000, 33_750)).toBe(12);
    expect(scoreBudget(25_000, 40_000)).toBe(5);
    expect(scoreBudget(25_000, 40_001)).toBe(0);
    expect(scoreBudget(25_000, undefined)).toBe(12);
  });

  it('keeps order stable when candidates arrive in a different order', () => {
    const normal = rankUniversities(canonicalDemoProfile, demoUniversities).map((item) => item.universityId);
    const reversed = rankUniversities(canonicalDemoProfile, [...demoUniversities].reverse())
      .map((item) => item.universityId);
    expect(reversed).toEqual(normal);
  });

  it('offers more than five schools when the provider has enough matches', () => {
    const candidates = Array.from({ length: 40 }, (_, index) => ({
      ...demoUniversities[0]!, id: `school-${index}`, name: `School ${index}`,
    }));
    const results = rankUniversities(canonicalDemoProfile, candidates);
    expect(results).toHaveLength(MAX_RECOMMENDATIONS);
    expect(new Set(results.map((item) => item.universityId)).size).toBe(MAX_RECOMMENDATIONS);
  });

  it('uses name and then ID for complete score ties', () => {
    const base = demoUniversities[0]!;
    const candidates = [
      { ...base, id: 'z', name: 'Alpha University' },
      { ...base, id: 'b', name: 'Beta University' },
      { ...base, id: 'a', name: 'Alpha University' },
    ];
    expect(rankUniversities(canonicalDemoProfile, candidates).map((item) => item.universityId))
      .toEqual(['a', 'z', 'b']);
  });

  it('changes budget score when the applicant budget changes', () => {
    const standard = rankUniversities(canonicalDemoProfile, demoUniversities)
      .find((result) => result.universityId === 'demo-gulf-metropolitan')!;
    const lower = rankUniversities({ ...canonicalDemoProfile, annualBudgetUsd: 14_000 }, demoUniversities)
      .find((result) => result.universityId === 'demo-gulf-metropolitan')!;
    expect(componentScore(standard, 'budget')).toBe(25);
    expect(componentScore(lower, 'budget')).toBe(0);
  });

  it('reranks otherwise equal schools when the budget changes', () => {
    const base = demoUniversities[0]!;
    const candidates = [
      { ...base, id: 'affordable', name: 'Zulu Affordable', tuitionOutOfStateUsd: 20_000 },
      { ...base, id: 'expensive', name: 'Alpha Expensive', tuitionOutOfStateUsd: 35_000 },
    ];
    expect(rankUniversities({ ...canonicalDemoProfile, annualBudgetUsd: 25_000 }, candidates)[0]?.universityId)
      .toBe('affordable');
    expect(rankUniversities({ ...canonicalDemoProfile, annualBudgetUsd: 40_000 }, candidates)[0]?.universityId)
      .toBe('expensive');
  });

  it('changes candidate programs when the target field changes', () => {
    const computerScience = rankUniversities(canonicalDemoProfile, demoUniversities);
    const business = rankUniversities({ ...canonicalDemoProfile, targetField: 'business' }, demoUniversities);
    expect(computerScience.map((item) => item.universityId)).not.toEqual(business.map((item) => item.universityId));
    expect(business.every((item) => item.university.programs.some((program) => program.field === 'business'))).toBe(true);
  });

  it('changes academic score when a reported SAT reference can be compared', () => {
    const base = rankUniversities(canonicalDemoProfile, demoUniversities)
      .find((result) => result.universityId === 'demo-lakeside-tech')!;
    const higherSat = rankUniversities({
      ...canonicalDemoProfile, sat: { status: 'taken', score: 1500 },
    }, demoUniversities).find((result) => result.universityId === 'demo-lakeside-tech')!;
    expect(componentScore(higherSat, 'academic')).toBeGreaterThan(componentScore(base, 'academic'));
    expect(base.reasonCodes).toContain('SAT_BELOW_REFERENCE');
    expect(higherSat.reasonCodes).toContain('SAT_ABOVE_REFERENCE');
  });

  it('uses neutral scores and concerns for missing optional school data', () => {
    const sparse = universitySchema.parse({
      id: 'sparse', provider: 'demo', name: 'Sparse College',
      programs: [{ key: 'cs', name: 'Computer Science', field: 'computer_science', degree: 'bachelor', sourceStatus: 'demo' }],
      sourceStatus: 'demo',
    });
    const result = rankUniversities(canonicalDemoProfile, [sparse])[0]!;
    expect(componentScore(result, 'budget')).toBe(12);
    expect(result.concerns.map((concern) => concern.code)).toEqual(expect.arrayContaining([
      'SAT_REFERENCE_UNKNOWN', 'COST_UNKNOWN', 'STATE_UNKNOWN',
    ]));
  });
});
