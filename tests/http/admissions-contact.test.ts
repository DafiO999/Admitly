import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import type { UniversityContactRepository } from '../../src/application/ports/university-contact-repository.js';

const contact = {
  id: randomUUID(), universityId: 'school-1', kind: 'undergraduate_admissions' as const,
  email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions',
  sourceStatus: 'official' as const, verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
};

describe('admissions contact route', () => {
  it('returns the server-side recipient and ignores attempts to supply another one', async () => {
    const repository: UniversityContactRepository = {
      findByUniversityId: async () => [contact],
      upsert: async () => undefined,
    };
    const app = buildApp({}, { contactRepository: repository });
    try {
      const result = await app.inject({
        method: 'GET', url: '/api/universities/school-1/admissions-contact?recipientEmail=attacker@example.com',
      });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual({ contact: {
        universityId: contact.universityId, kind: contact.kind, email: contact.email,
        sourceUrl: contact.sourceUrl, sourceStatus: contact.sourceStatus, verifiedAt: contact.verifiedAt,
      } });
    } finally {
      await app.close();
    }
  });

  it('returns a dedicated 404 for unavailable contacts', async () => {
    const repository: UniversityContactRepository = {
      findByUniversityId: async () => [{ ...contact, active: false }],
      upsert: async () => undefined,
    };
    const app = buildApp({}, { contactRepository: repository });
    try {
      const result = await app.inject({ method: 'GET', url: '/api/universities/school-1/admissions-contact' });
      expect(result.statusCode).toBe(404);
      expect(result.json().error.code).toBe('UNIVERSITY_EMAIL_UNAVAILABLE');
    } finally {
      await app.close();
    }
  });
});
