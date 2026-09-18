import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createPrismaClient } from '../../src/infrastructure/db/prisma/client.js';
import { PrismaUniversityContactRepository } from '../../src/infrastructure/db/repositories/prisma-university-contact-repository.js';
import { demoUniversities } from '../../src/infrastructure/demo/fixtures.js';
import { getTestDatabaseUrl } from './test-database-url.js';

const databaseUrl = getTestDatabaseUrl(process.env);

describe('university contact persistence', () => {
  it.skipIf(databaseUrl === null)('stores a sourced contact and excludes it after deactivation', async () => {
    const client = createPrismaClient(databaseUrl!);
    const repository = new PrismaUniversityContactRepository(client);
    const id = randomUUID();
    const universityId = `contact-test-${randomUUID()}`;
    const contact = {
      id, universityId, kind: 'international_admissions' as const,
      email: 'verified@example.edu', sourceUrl: 'https://example.edu/admissions/contact',
      sourceStatus: 'official' as const, verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
    };
    const app = buildApp({}, { contactRepository: repository });
    try {
      await client.university.create({ data: {
        id: universityId, provider: 'demo', name: 'Contact Test University',
        programs: demoUniversities[0]!.programs, sourceStatus: 'demo',
      } });
      await repository.upsert(contact);
      expect(await repository.findByUniversityId(universityId)).toContainEqual(contact);
      const response = await app.inject({ method: 'GET', url: `/api/universities/${universityId}/admissions-contact` });
      expect(response.statusCode).toBe(200);
      expect(response.json().contact.email).toBe(contact.email);

      await repository.upsert({ ...contact, active: false });
      const inactive = await app.inject({ method: 'GET', url: `/api/universities/${universityId}/admissions-contact` });
      expect(inactive.statusCode).toBe(404);
      expect(inactive.json().error.code).toBe('UNIVERSITY_EMAIL_UNAVAILABLE');

      await expect(client.universityContact.update({
        where: { id }, data: { sourceStatus: 'unknown' },
      })).rejects.toThrow();
      await expect(client.universityContact.update({
        where: { id }, data: { sourceUrl: '' },
      })).rejects.toThrow();
    } finally {
      await app.close();
      await client.universityContact.deleteMany({ where: { id } });
      await client.university.deleteMany({ where: { id: universityId } });
      await client.$disconnect();
    }
  });
});
