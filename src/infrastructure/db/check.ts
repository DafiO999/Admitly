import 'dotenv/config';
import { loadEnvironment } from '../../config/env.js';
import { checkDatabaseConnectivity } from './prisma/client.js';

async function main(): Promise<void> {
  const { DATABASE_URL } = loadEnvironment(process.env);
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }
  await checkDatabaseConnectivity(DATABASE_URL);
  process.stdout.write('Database connection OK\n');
}

main().catch(() => {
  process.stderr.write('Database connection failed; check DATABASE_URL and PostgreSQL availability\n');
  process.exitCode = 1;
});
