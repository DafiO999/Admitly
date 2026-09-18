import { describe, expect, it } from 'vitest';
import { buildRoadmap, selectNextAction } from '../../src/domain/roadmap/builder.js';
import { roadmapItemSchema, type RoadmapStatus } from '../../src/domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../../src/domain/university/requirement.js';
import { canonicalDemoProfile, demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

const ids = ['demo-redwood-state', 'demo-gulf-metropolitan'];
const schools = ids.map((id) => ({
  university: demoUniversities.find((university) => university.id === id)!,
  requirements: demoRequirements.filter((requirement) => requirement.universityId === id),
}));

describe('roadmap builder', () => {
  it('uses only sourced deadlines and returns one deterministic next action', () => {
    const first = buildRoadmap(canonicalDemoProfile, schools);
    const second = buildRoadmap(canonicalDemoProfile, schools.map((school) => ({
      ...school, requirements: [...school.requirements].reverse(),
    })));
    expect(first).toEqual(second);
    expect(first.sourceCoverage).toEqual({ official: 0, verified: 0, demo: 4, unknown: 0 });
    expect(first.roadmap.rulesVersion).toBe('1.0.0');
    expect(first.roadmap.nextActionId).toBe('research:programs');
    expect(first.roadmap.items.filter((item) => item.isNextAction)).toHaveLength(1);
    const deadlines = first.roadmap.items.filter((item) => item.dueDate);
    expect(deadlines.map((item) => item.dueDate)).toEqual(['2028-01-15', '2028-02-15']);
    expect(deadlines.every((item) => item.sourceStatus === 'demo')).toBe(true);
    expect(first.roadmap.items.every((item) => roadmapItemSchema.safeParse(item).success)).toBe(true);
  });

  it('skips dates explicitly tied to a different intake and marks the deadline unknown', () => {
    const result = buildRoadmap({ ...canonicalDemoProfile, targetIntakeYear: 2029 }, schools);
    expect(result.roadmap.items.filter((item) => item.dueDate)).toEqual([]);
    expect(result.sourceCoverage).toEqual({ official: 0, verified: 0, demo: 2, unknown: 2 });
    expect(result.roadmap.items.filter((item) => item.id.endsWith(':apply'))).toHaveLength(2);
    expect(result.roadmap.items.filter((item) => item.id.endsWith(':apply'))
      .every((item) => item.sourceStatus === 'unknown')).toBe(true);
  });

  it('selects the earliest actionable deadline and respects done and blocked statuses', () => {
    const initial = buildRoadmap(canonicalDemoProfile, schools).roadmap;
    const prerequisiteStatuses = Object.fromEntries(initial.items
      .filter((item) => item.category !== 'application')
      .map((item) => [item.id, 'done' as RoadmapStatus]));
    const ready = buildRoadmap(canonicalDemoProfile, schools, prerequisiteStatuses).roadmap;
    expect(ready.nextActionId).toBe('school:demo-redwood-state:deadline:demo-redwood-state-deadline');
    expect(ready.items.filter((item) => item.isNextAction)).toHaveLength(1);
    const blocked = buildRoadmap(canonicalDemoProfile, schools, {
      ...prerequisiteStatuses, [ready.nextActionId!]: 'blocked',
    }).roadmap;
    expect(blocked.nextActionId).toBe('school:demo-gulf-metropolitan:deadline:demo-gulf-metropolitan-deadline');
    const complete = buildRoadmap(canonicalDemoProfile, schools, {
      ...prerequisiteStatuses,
      [ready.nextActionId!]: 'blocked',
      [blocked.nextActionId!]: 'done',
    }).roadmap;
    expect(complete.nextActionId).toBeNull();
    expect(complete.items.every((item) => !item.isNextAction)).toBe(true);
  });

  it('does not select pending tasks whose dependencies are blocked', () => {
    const items = [
      roadmapItemSchema.parse({
        id: 'blocked', title: 'Blocked', category: 'research', priority: 1,
        status: 'blocked', dependsOnIds: [], isNextAction: false,
      }),
      roadmapItemSchema.parse({
        id: 'dependent', title: 'Dependent', category: 'application', priority: 10,
        status: 'pending', dependsOnIds: ['blocked'], isNextAction: false,
      }),
    ];
    expect(selectNextAction(items)).toBeNull();
  });

  it('adds exam preparation when a required score is not completed', () => {
    const profile = {
      ...canonicalDemoProfile,
      englishExam: { type: 'IELTS' as const, status: 'planned' as const },
      sat: { status: 'planned' as const },
    };
    const result = buildRoadmap(profile, [schools[0]!]).roadmap;
    expect(result.nextActionId).toBe('exam:english');
    expect(result.items.some((item) => item.id === 'exam:sat')).toBe(true);
    const englishRequirement = result.items.find((item) => item.id.endsWith('requirement:demo-redwood-state-english'))!;
    expect(englishRequirement.dependsOnIds).toContain('exam:english');
    expect(englishRequirement.isNextAction).toBe(false);
  });

  it('preserves official deadline source URL and excludes requirements for another program', () => {
    const deadline = admissionRequirementSchema.parse({
      id: 'official-deadline', universityId: 'demo-redwood-state', kind: 'application_deadline',
      label: 'Application deadline', valueText: 'Apply by January 15', date: '2028-01-15',
      sourceStatus: 'official', sourceUrl: 'https://example.edu/apply',
    });
    const unrelated = admissionRequirementSchema.parse({
      id: 'engineering-only', universityId: 'demo-redwood-state', programKey: 'engineering',
      kind: 'document', label: 'Portfolio', valueText: 'Submit a portfolio', sourceStatus: 'demo',
    });
    const result = buildRoadmap(canonicalDemoProfile, [{
      university: schools[0]!.university, requirements: [unrelated, deadline],
    }]);
    expect(result.sourceCoverage).toEqual({ official: 1, verified: 0, demo: 0, unknown: 0 });
    const item = result.roadmap.items.find((candidate) => candidate.dueDate)!;
    expect(item.sourceStatus).toBe('official');
    expect(item.sourceUrl).toBe('https://example.edu/apply');
    expect(result.roadmap.items.some((candidate) => candidate.id.includes('engineering-only'))).toBe(false);
  });

  it('represents absent requirements as unknown without a date', () => {
    const result = buildRoadmap(canonicalDemoProfile, [{ university: schools[0]!.university, requirements: [] }]);
    expect(result.sourceCoverage).toEqual({ official: 0, verified: 0, demo: 0, unknown: 1 });
    const application = result.roadmap.items.find((item) => item.category === 'application')!;
    expect(application.sourceStatus).toBe('unknown');
    expect(application.dueDate).toBeUndefined();
  });

  it('adds a sourced email task and only the allowed letter fields for a verified contact', () => {
    const withContact = buildRoadmap(canonicalDemoProfile, [{ ...schools[0]!, admissionsContact: {
      email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
      sourceStatus: 'verified' as const,
    } }]).roadmap;
    const email = withContact.items.find((item) => item.category === 'university_email')!;
    expect(email.id).toBe('school:demo-redwood-state:email');
    expect(email.dependsOnIds).toEqual(['school:demo-redwood-state:verify']);
    expect(email.sourceStatus).toBe('verified');
    expect(email.letter).toEqual({ universityId: 'demo-redwood-state',
      recipientEmail: 'admissions@example.edu', body: '' });
    expect(withContact.progress).toEqual({ done: 0, total: withContact.items.length, percent: 0 });
    expect(buildRoadmap(canonicalDemoProfile, [schools[0]!]).roadmap.items
      .some((item) => item.category === 'university_email')).toBe(false);
  });
});
