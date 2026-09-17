import { describe, expect, it } from 'vitest';
import { diagnoseProfile } from '../../src/domain/diagnosis/service.js';
import { canonicalDemoProfile } from '../../src/infrastructure/demo/fixtures.js';

describe('deterministic diagnosis', () => {
  it('uses the target field and normalized GPA in the goal and strengths', () => {
    const diagnosis = diagnoseProfile({
      ...canonicalDemoProfile,
      targetField: 'engineering',
      gpaValue: 90,
      gpaScale: 100,
    });

    expect(diagnosis.goalSummary).toContain('engineering');
    expect(diagnosis.goalSummary).toContain('2028');
    expect(diagnosis.strengths).toContain('Your normalized GPA is 3.6/4, at or above the 3.5/4 planning threshold.');
    expect(diagnosis.focusNow.at(-1)).toContain('engineering');
  });

  it('flags a budget below the stated planning threshold', () => {
    const diagnosis = diagnoseProfile({ ...canonicalDemoProfile, annualBudgetUsd: 18_000 });

    expect(diagnosis.constraints).toContain('Your annual budget of $18,000 is below the $25,000 planning threshold.');
    expect(diagnosis.focusNow).toContain('Compare program costs with your $18,000 annual budget.');
  });

  it('identifies missing exam data without asserting a program requirement', () => {
    const diagnosis = diagnoseProfile({ ...canonicalDemoProfile, englishExam: undefined, sat: undefined });

    expect(diagnosis.constraints).toContain('No completed English exam score is in your profile.');
    expect(diagnosis.focusNow).toContain('Decide which English exam to take and add a plan to your profile.');
    expect(diagnosis.focusNow).toContain('Check whether your target programs consider the SAT before planning a test.');
  });

  it('returns the same result for the same profile', () => {
    expect(diagnoseProfile(canonicalDemoProfile)).toEqual(diagnoseProfile(canonicalDemoProfile));
  });
});
