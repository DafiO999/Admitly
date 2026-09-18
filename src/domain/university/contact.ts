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
