import { z } from 'zod';
import type { UniversityContactRepository } from '../ports/university-contact-repository.js';
import { selectSendableContact, type UniversityContact } from '../../domain/university/contact.js';

export class UniversityEmailUnavailableError extends Error {
  constructor() {
    super('University admissions email unavailable');
    this.name = 'UniversityEmailUnavailableError';
  }
}

export async function findSendableContact(
  universityId: unknown,
  repositoryFactory: () => UniversityContactRepository,
): Promise<UniversityContact> {
  const id = z.string().min(1).parse(universityId);
  const contacts = await repositoryFactory().findByUniversityId(id);
  const contact = selectSendableContact(id, contacts);
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
