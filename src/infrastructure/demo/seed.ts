import type { PrismaClient } from '@prisma/client';
import type { AdmissionRequirement } from '../../domain/university/requirement.js';
import type { University } from '../../domain/university/schema.js';
import { demoRequirements, demoUniversities } from './fixtures.js';

function universityData(university: University) {
  return {
    provider: university.provider,
    name: university.name,
    city: university.city ?? null,
    state: university.state ?? null,
    websiteUrl: university.websiteUrl ?? null,
    studentSize: university.studentSize ?? null,
    admissionRate: university.admissionRate ?? null,
    tuitionOutOfStateUsd: university.tuitionOutOfStateUsd ?? null,
    averageNetPriceUsd: university.averageNetPriceUsd ?? null,
    satMedian: university.satMedian ?? null,
    programs: university.programs,
    dataYear: university.dataYear ?? null,
    sourceUrl: university.sourceUrl ?? null,
    sourceStatus: university.sourceStatus,
  };
}

function requirementData(requirement: AdmissionRequirement) {
  return {
    universityId: requirement.universityId,
    programKey: requirement.programKey ?? null,
    kind: requirement.kind,
    label: requirement.label,
    valueText: requirement.valueText,
    numericValue: requirement.numericValue ?? null,
    date: requirement.date ? new Date(`${requirement.date}T00:00:00.000Z`) : null,
    sourceUrl: requirement.sourceUrl ?? null,
    sourceTitle: requirement.sourceTitle ?? null,
    sourceStatus: requirement.sourceStatus,
    checkedAt: requirement.checkedAt ? new Date(requirement.checkedAt) : null,
  };
}

export async function seedDemoData(client: PrismaClient): Promise<void> {
  await client.$transaction(async (transaction) => {
    for (const university of demoUniversities) {
      const data = universityData(university);
      await transaction.university.upsert({
        where: { id: university.id },
        create: { id: university.id, ...data },
        update: data,
      });
    }
    for (const requirement of demoRequirements) {
      const data = requirementData(requirement);
      await transaction.admissionRequirement.upsert({
        where: { id: requirement.id },
        create: { id: requirement.id, ...data },
        update: data,
      });
    }
  });
}
