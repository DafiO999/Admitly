import { PrismaClient } from '@prisma/client';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasourceUrl: databaseUrl });
}

export async function checkDatabaseConnectivity(databaseUrl: string): Promise<void> {
  const client = createPrismaClient(databaseUrl);
  try {
    await client.$queryRaw`SELECT 1`;
  } finally {
    await client.$disconnect();
  }
}
