import { describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { demoRequirements, demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { seedDemoData } from '../../src/infrastructure/demo/seed.js';
import { getTestDatabaseUrl } from './test-database-url.js';

const databaseUrl = getTestDatabaseUrl(process.env);

describe('demo database seed', () => {
  it.skipIf(databaseUrl === null)('is repeatable and persists validated fixtures', async () => {
    const client = createPrismaClient(databaseUrl!);
    try {
      await seedDemoData(client);
      await seedDemoData(client);

      const ids = demoUniversities.map(({ id }) => id);
      const universities = await client.university.findMany({ where: { id: { in: ids } } });
      const requirements = await client.admissionRequirement.findMany({
        where: { universityId: { in: ids } },
      });
      expect(universities).toHaveLength(demoUniversities.length);
      expect(requirements).toHaveLength(demoRequirements.length);
      expect(universities.every(({ sourceStatus }) => sourceStatus === 'demo')).toBe(true);
      expect(requirements.every(({ sourceStatus }) => sourceStatus === 'demo')).toBe(true);
    } finally {
      await client.$disconnect();
    }
  });

  it.skipIf(databaseUrl === null)('rejects an official requirement without a source URL in PostgreSQL', async () => {
    const client = createPrismaClient(databaseUrl!);
    const id = 'demo-source-constraint-check';
    try {
      await seedDemoData(client);
      await expect(client.admissionRequirement.create({ data: {
        id,
        universityId: demoUniversities[0]!.id,
        kind: 'document',
        label: 'Constraint check',
        valueText: 'Test only',
        sourceStatus: 'official',
      } })).rejects.toThrow();
    } finally {
      await client.admissionRequirement.deleteMany({ where: { id } });
      await client.$disconnect();
    }
  });
});
