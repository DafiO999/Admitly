import { describe, expect, it } from 'vitest';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';
import { createProfileHash } from '../../src/domain/profile/hash.js';
import { normalizeGpa } from '../../src/domain/profile/normalize.js';
import { studentProfileSchema } from '../../src/domain/profile/schema.js';

describe('profile domain', () => {
  it('normalizes supported GPA scales to a four-point value', () => {
    expect(normalizeGpa(3.5, 4)).toBe(3.5);
    expect(normalizeGpa(4.5, 5)).toBe(3.6);
    expect(normalizeGpa(8, 10)).toBe(3.2);
    expect(normalizeGpa(90, 100)).toBe(3.6);
    expect(() => normalizeGpa(6, 5)).toThrow(RangeError);
  });

  it('validates GPA and exam status with scores', () => {
    expect(studentProfileSchema.safeParse(canonicalDemoProfile).success).toBe(true);
    expect(studentProfileSchema.safeParse({ ...canonicalDemoProfile, gpaValue: 4.1 }).success).toBe(false);
    expect(studentProfileSchema.safeParse({ ...canonicalDemoProfile, sat: { status: 'taken' } }).success).toBe(false);
    expect(studentProfileSchema.safeParse({ ...canonicalDemoProfile, sat: { status: 'planned', score: 1200 } }).success).toBe(false);
    expect(studentProfileSchema.safeParse({
      ...canonicalDemoProfile, englishExam: { type: 'IELTS', status: 'taken', score: 10 },
    }).success).toBe(false);
  });

  it('hashes profile content consistently and ignores identity and state order', () => {
    const hash = createProfileHash(canonicalDemoProfile);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(createProfileHash({
      ...canonicalDemoProfile,
      id: '86c55caa-70c0-4ae3-b732-6a312e2531bd',
      preferredStates: ['TX', 'CA', 'CA'],
    })).toBe(hash);
    expect(createProfileHash({ ...canonicalDemoProfile, annualBudgetUsd: 30000 })).not.toBe(hash);
    expect(createProfileHash({ ...canonicalDemoProfile, targetField: 'engineering' })).not.toBe(hash);
    expect(createProfileHash({ ...canonicalDemoProfile, sat: { status: 'taken', score: 1300 } })).not.toBe(hash);
  });
});
