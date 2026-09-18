import type { PrismaClient, UniversityContact as StoredContact } from '@prisma/client';
import type { UniversityContactRepository } from '../../../application/ports/university-contact-repository.js';
import { DatabaseUnavailableError } from '../../../application/ports/plan-repository.js';
import { universityContactSchema, type UniversityContact } from '../../../domain/university/contact.js';

function fromStored(row: StoredContact): UniversityContact | null {
  const parsed = universityContactSchema.safeParse({
    id: row.id,
    universityId: row.universityId,
    kind: row.kind,
    email: row.email,
    sourceUrl: row.sourceUrl,
    ...(row.sourceTitle ? { sourceTitle: row.sourceTitle } : {}),
    sourceStatus: row.sourceStatus,
    verifiedAt: row.verifiedAt.toISOString(),
    active: row.active,
  });
  return parsed.success ? parsed.data : null;
}

export class PrismaUniversityContactRepository implements UniversityContactRepository {
  constructor(private readonly client: PrismaClient) {}

  async findByUniversityId(universityId: string): Promise<UniversityContact[]> {
    try {
      const rows = await this.client.universityContact.findMany({ where: { universityId } });
      return rows.map(fromStored).filter((contact): contact is UniversityContact => contact !== null);
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async upsert(input: UniversityContact): Promise<void> {
    const contact = universityContactSchema.parse(input);
    const data = {
      universityId: contact.universityId,
      kind: contact.kind,
      email: contact.email,
      sourceUrl: contact.sourceUrl,
      sourceTitle: contact.sourceTitle ?? null,
      sourceStatus: contact.sourceStatus,
      verifiedAt: new Date(contact.verifiedAt),
      active: contact.active,
    };
    try {
      await this.client.universityContact.upsert({
        where: { id: contact.id },
        create: { id: contact.id, ...data },
        update: data,
      });
    } catch {
      throw new DatabaseUnavailableError();
    }
  }
}
