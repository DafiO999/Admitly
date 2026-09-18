import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { universityContactSchema, isSendableContact } from '../../src/domain/university/contact.js';
import { resolveAdmissionsContact, UniversityEmailUnavailableError } from '../../src/application/services/admissions-contact.js';
import type { UniversityContactRepository } from '../../src/application/ports/university-contact-repository.js';

const base = {
  id: randomUUID(), universityId: 'school-1', kind: 'international_admissions' as const,
  email: 'admissions@example.edu', sourceUrl: 'https://example.edu/admissions/contact',
  sourceStatus: 'official' as const, verifiedAt: '2026-09-18T00:00:00.000Z', active: true,
};

function repository(contacts: unknown[]): UniversityContactRepository {
  return {
    findByUniversityId: async () => contacts as Awaited<ReturnType<UniversityContactRepository['findByUniversityId']>>,
    upsert: async () => undefined,
  };
}

describe('verified university contacts', () => {
  it('requires an HTTPS source and approved status', () => {
    expect(universityContactSchema.safeParse(base).success).toBe(true);
    for (const change of [
      { sourceUrl: '' }, { sourceUrl: 'http://example.edu/contact' },
      { sourceStatus: 'demo' }, { sourceStatus: 'unknown' }, { email: 'bad-address' },
    ]) {
      expect(universityContactSchema.safeParse({ ...base, ...change }).success).toBe(false);
    }
  });

  it('selects only active, valid contacts for the requested university', async () => {
    const contacts = [
      { ...base, active: false },
      { ...base, id: randomUUID(), sourceStatus: 'unknown' },
      { ...base, id: randomUUID(), universityId: 'other-school' },
      { ...base, id: randomUUID(), kind: 'general_admissions' },
      { ...base, id: randomUUID(), email: 'international@example.edu' },
    ];
    expect(isSendableContact(contacts[0])).toBe(false);
    const result = await resolveAdmissionsContact('school-1', () => repository(contacts));
    expect(result.contact.email).toBe('international@example.edu');
    expect(result.contact).not.toHaveProperty('active');
    expect(result.contact).not.toHaveProperty('id');
  });

  it('rejects missing, inactive and unverified contacts', async () => {
    for (const contacts of [[], [{ ...base, active: false }], [{ ...base, sourceStatus: 'demo' }]]) {
      await expect(resolveAdmissionsContact('school-1', () => repository(contacts)))
        .rejects.toBeInstanceOf(UniversityEmailUnavailableError);
    }
  });
});
