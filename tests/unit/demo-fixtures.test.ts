import { describe, expect, it } from 'vitest';
import { admissionRequirementSchema } from '../../src/domain/university/requirement.js';
import { universitySchema } from '../../src/domain/university/schema.js';
import { demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

describe('demo fixtures', () => {
  it('contains validated, uniquely identified demo universities and requirements', () => {
    expect(demoUniversities).toHaveLength(8);
    expect(demoRequirements).toHaveLength(16);
    expect(universitySchema.array().safeParse(demoUniversities).success).toBe(true);
    expect(admissionRequirementSchema.array().safeParse(demoRequirements).success).toBe(true);
    expect(new Set(demoUniversities.map(({ id }) => id)).size).toBe(8);
    expect(new Set(demoRequirements.map(({ id }) => id)).size).toBe(16);
    expect(demoUniversities.every(({ sourceStatus }) => sourceStatus === 'demo')).toBe(true);
    expect(demoUniversities.every(({ programs }) => programs.every(({ sourceStatus }) => sourceStatus === 'demo'))).toBe(true);
    expect(demoRequirements.every(({ sourceStatus }) => sourceStatus === 'demo')).toBe(true);
    expect(demoRequirements.every(({ universityId }) => demoUniversities.some(({ id }) => id === universityId))).toBe(true);
  });

  it('supports later field, budget, and SAT comparisons', () => {
    const fields = (field: string) => demoUniversities.filter((university) =>
      university.programs.some((program) => program.field === field));
    expect(fields('computer_science').length).toBeGreaterThanOrEqual(3);
    expect(fields('business').length).toBeGreaterThanOrEqual(3);
    expect(fields('design').length).toBeGreaterThanOrEqual(3);
    const costs = demoUniversities.flatMap(({ tuitionOutOfStateUsd }) =>
      tuitionOutOfStateUsd === undefined ? [] : [tuitionOutOfStateUsd]);
    expect(Math.max(...costs) - Math.min(...costs)).toBeGreaterThan(30000);
    expect(new Set(demoUniversities.map(({ satMedian }) => satMedian)).size).toBeGreaterThanOrEqual(4);
  });
});
