import { describe, expect, it } from 'vitest';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { getTestDatabaseUrl } from './test-database-url.js';

const databaseUrl = getTestDatabaseUrl(process.env);

describe('test database connectivity', () => {
  it.skipIf(databaseUrl === null)('connects to the migrated test schema', async () => {
    const client = createPrismaClient(databaseUrl!);
    try {
      const schemas = await client.$queryRaw<Array<{ schema: string }>>`SELECT current_schema() AS schema`;
      expect(schemas[0]?.schema).toBe('admitly_test');

      const migrations = await client.$queryRaw<Array<{ migration_name: string }>>`
        SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL
      `;
      expect(migrations.map(({ migration_name }) => migration_name)).toContain('20260917000000_initial');
    } finally {
      await client.$disconnect();
    }
  });
});
