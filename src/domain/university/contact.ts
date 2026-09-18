import { z } from 'zod';

export const universityContactSchema = z.object({
  id: z.uuid(),
  universityId: z.string().min(1),
  kind: z.enum(['undergraduate_admissions', 'international_admissions', 'general_admissions']),
  email: z.email(),
  sourceUrl: z.url().refine((url) => url.startsWith('https://'), 'Source URL must use HTTPS'),
  sourceTitle: z.string().min(1).optional(),
  sourceStatus: z.enum(['official', 'verified']),
  verifiedAt: z.iso.datetime({ offset: true }),
  active: z.boolean(),
}).strict();

export type UniversityContact = z.infer<typeof universityContactSchema>;

export function isSendableContact(value: unknown): value is UniversityContact {
  const parsed = universityContactSchema.safeParse(value);
  return parsed.success && parsed.data.active;
}

const contactPriority: Record<UniversityContact['kind'], number> = {
  international_admissions: 0,
  undergraduate_admissions: 1,
  general_admissions: 2,
};

export function selectSendableContact(universityId: string, values: unknown[]): UniversityContact | null {
  return values.filter(isSendableContact).filter((contact) => contact.universityId === universityId)
    .sort((a, b) => contactPriority[a.kind] - contactPriority[b.kind]
      || b.verifiedAt.localeCompare(a.verifiedAt) || a.id.localeCompare(b.id))[0] ?? null;
}
