import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
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

  it.skipIf(databaseUrl === null)('reports ready against the migrated database schema', async () => {
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = databaseUrl!;
    const app = buildApp();
    try {
      const response = await app.inject({ method: 'GET', url: '/api/ready' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ready' });
    } finally {
      await app.close();
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});
