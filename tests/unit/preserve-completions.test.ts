import { describe, expect, it } from 'vitest';
import { buildRoadmap } from '../../src/domain/roadmap/builder.js';
import { preserveCompletedTasks } from '../../src/domain/roadmap/preserve-completions.js';
import { canonicalDemoProfile, demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

describe('completed roadmap task preservation', () => {
  it('keeps matching completions and reopens changed requirements and their dependents', () => {
    const university = demoUniversities[0]!;
    const requirements = demoRequirements.filter((requirement) => requirement.universityId === university.id);
    const selected = [university.id];
    const original = buildRoadmap(canonicalDemoProfile, [{ university, requirements }]).roadmap;
    const statuses = Object.fromEntries(original.items.map((item) => [item.id, 'done' as const]));
    const completed = buildRoadmap(canonicalDemoProfile, [{ university, requirements }], statuses).roadmap;
    const changedRequirements = requirements.map((requirement) => requirement.kind === 'english'
      ? { ...requirement, valueText: 'Changed English exam requirement' } : requirement);
    const next = buildRoadmap(canonicalDemoProfile, [{ university, requirements: changedRequirements }]).roadmap;
    const merged = preserveCompletedTasks(
      completed, next, canonicalDemoProfile, canonicalDemoProfile, selected, selected,
    );
    const status = (id: string) => merged.items.find((item) => item.id === id)?.status;
    expect(status('research:programs')).toBe('done');
    expect(status('document:academic-records')).toBe('done');
    expect(status(`school:${university.id}:verify`)).toBe('done');
    expect(status(`school:${university.id}:requirement:${university.id}-english`)).toBe('pending');
    expect(status(`school:${university.id}:deadline:${university.id}-deadline`)).toBe('pending');
    expect(merged.nextActionId).toBe(`school:${university.id}:requirement:${university.id}-english`);
  });

  it('reopens program review when the selected schools change', () => {
    const university = demoUniversities[0]!;
    const requirements = demoRequirements.filter((requirement) => requirement.universityId === university.id);
    const original = buildRoadmap(canonicalDemoProfile, [{ university, requirements }], {
      'research:programs': 'done', 'document:academic-records': 'done',
    }).roadmap;
    const next = buildRoadmap(canonicalDemoProfile, [{ university, requirements }]).roadmap;
    const merged = preserveCompletedTasks(
      original, next, canonicalDemoProfile, canonicalDemoProfile,
      [university.id, 'another-school'], [university.id],
    );
    expect(merged.items.find((item) => item.id === 'research:programs')?.status).toBe('pending');
    expect(merged.items.find((item) => item.id === 'document:academic-records')?.status).toBe('done');
  });
});
