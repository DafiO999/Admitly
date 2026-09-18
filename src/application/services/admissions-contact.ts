import { z } from 'zod';
import type { UniversityContactRepository } from '../ports/university-contact-repository.js';
import { isSendableContact, type UniversityContact } from '../../domain/university/contact.js';

export class UniversityEmailUnavailableError extends Error {
  constructor() {
    super('University admissions email unavailable');
    this.name = 'UniversityEmailUnavailableError';
  }
}

const contactPriority: Record<UniversityContact['kind'], number> = {
  international_admissions: 0,
  undergraduate_admissions: 1,
  general_admissions: 2,
};

export async function findSendableContact(
  universityId: unknown,
  repositoryFactory: () => UniversityContactRepository,
): Promise<UniversityContact> {
  const id = z.string().min(1).parse(universityId);
  const contacts = await repositoryFactory().findByUniversityId(id);
  const contact = contacts.filter((item) => item.universityId === id && isSendableContact(item))
    .sort((a, b) => contactPriority[a.kind] - contactPriority[b.kind]
      || b.verifiedAt.localeCompare(a.verifiedAt) || a.id.localeCompare(b.id))[0];
  if (!contact) throw new UniversityEmailUnavailableError();
  return contact;
}

export async function resolveAdmissionsContact(
  universityId: unknown,
  repositoryFactory: () => UniversityContactRepository,
): Promise<{ contact: Pick<UniversityContact, 'universityId' | 'kind' | 'email' | 'sourceUrl' | 'sourceStatus' | 'verifiedAt'> }> {
  const contact = await findSendableContact(universityId, repositoryFactory);
  return { contact: {
    universityId: contact.universityId,
    kind: contact.kind,
    email: contact.email,
    sourceUrl: contact.sourceUrl,
    sourceStatus: contact.sourceStatus,
    verifiedAt: contact.verifiedAt,
  } };
}
