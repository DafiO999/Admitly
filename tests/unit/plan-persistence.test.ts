import { describe, expect, it, vi } from 'vitest';
import type { GeneratedPlan, PersistedPlan, PlanRepository } from '../../src/application/ports/plan-repository.js';
import { saveProfileAndPlan } from '../../src/application/services/plan-persistence.js';
import { canonicalDemoProfile, demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

describe('plan persistence service', () => {
  it('builds the roadmap from the exact university snapshot used for ranking', async () => {
    let captured: GeneratedPlan | undefined;
    const saveGenerated = vi.fn<PlanRepository['saveGenerated']>().mockImplementation(async (plan) => {
      captured = plan;
      return plan as unknown as PersistedPlan;
    });
    const snapshot = { ...demoUniversities[0]!, name: 'Snapshot University' };
    await saveProfileAndPlan({ profile: canonicalDemoProfile }, () => ({
      universityProvider: {
        search: async () => [snapshot, ...demoUniversities.slice(1)],
        getById: async () => { throw new Error('Must not re-fetch universities'); },
      },
      requirementProvider: {
        listByUniversityIds: async (ids) => demoRequirements.filter((requirement) => ids.includes(requirement.universityId)),
      },
    }), () => ({ saveGenerated, findCurrent: async () => null, updateItemStatus: async () => null }));
    expect(saveGenerated).toHaveBeenCalledOnce();
    const ranked = captured!.recommendations.find((item) => item.universityId === snapshot.id)!;
    expect(ranked.university.name).toBe('Snapshot University');
    const task = captured!.roadmap.items.find((item) => item.id === `school:${snapshot.id}:verify`)!;
    expect(task.title).toContain('Snapshot University');
  });
});
