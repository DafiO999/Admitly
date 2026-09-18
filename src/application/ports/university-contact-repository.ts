import type { UniversityContact } from '../../domain/university/contact.js';

export interface UniversityContactRepository {
  findByUniversityId(universityId: string): Promise<UniversityContact[]>;
  upsert(contact: UniversityContact): Promise<void>;
}
