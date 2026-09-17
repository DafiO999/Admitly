import { describe, expect, it } from 'vitest';
import { roadmapItemSchema } from '../../src/domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../../src/domain/university/requirement.js';
import { universitySchema } from '../../src/domain/university/schema.js';
import { demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';

describe('source evidence', () => {
  it('rejects official and verified requirements without a source URL', () => {
    const requirement = demoRequirements[0]!;
    expect(admissionRequirementSchema.safeParse({ ...requirement, sourceStatus: 'official' }).success).toBe(false);
    expect(admissionRequirementSchema.safeParse({ ...requirement, sourceStatus: 'verified' }).success).toBe(false);
    expect(admissionRequirementSchema.safeParse({
      ...requirement, sourceStatus: 'official', sourceUrl: 'https://example.edu/admissions',
    }).success).toBe(true);
    expect(admissionRequirementSchema.safeParse({ ...requirement, sourceStatus: 'unknown' }).success).toBe(false);
    expect(admissionRequirementSchema.safeParse(requirement).success).toBe(true);
  });

  it('requires evidence for a verified university and a known roadmap due date', () => {
    const university = demoUniversities[0]!;
    expect(universitySchema.safeParse({ ...university, sourceStatus: 'verified' }).success).toBe(false);
    expect(universitySchema.safeParse({
      ...university,
      programs: [{ ...university.programs[0]!, sourceStatus: 'verified' }],
    }).success).toBe(false);
    const item = {
      id: 'task-1', title: 'Apply', category: 'application', dueDate: '2028-01-15',
      priority: 1, status: 'pending', dependsOnIds: [], isNextAction: true,
    };
    expect(roadmapItemSchema.safeParse(item).success).toBe(false);
    expect(roadmapItemSchema.safeParse({ ...item, sourceStatus: 'demo' }).success).toBe(true);
    expect(roadmapItemSchema.safeParse({ ...item, sourceStatus: 'official' }).success).toBe(false);
  });
});
