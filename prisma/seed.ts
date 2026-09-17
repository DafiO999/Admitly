import 'dotenv/config';
import { loadEnvironment } from '../src/config/env.js';
import { createPrismaClient } from '../src/infrastructure/db/prisma/client.js';
import { seedDemoData } from '../src/infrastructure/demo/seed.js';

async function main(): Promise<void> {
  const env = loadEnvironment(process.env);
  const databaseUrl = env.DATABASE_URL;
  const database = databaseUrl ? new URL(databaseUrl) : null;
  if (!databaseUrl || !database || env.NODE_ENV === 'production' || !env.DEMO_DATA_MODE
    || !['localhost', '127.0.0.1'].includes(database.hostname)
    || database.pathname !== '/admitly') {
    throw new Error('Demo seed is only available with a local development database');
  }
  const client = createPrismaClient(databaseUrl);
  try {
    await seedDemoData(client);
    process.stdout.write('Demo universities and requirements seeded\n');
  } finally {
    await client.$disconnect();
  }
}

main().catch(() => {
  process.stderr.write('Demo seed failed; check configuration and database availability\n');
  process.exitCode = 1;
});
