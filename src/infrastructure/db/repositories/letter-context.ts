import { Prisma } from '@prisma/client';
import { createLetterUniversityHash } from '../../../domain/letter/context.js';
import { createProfileHash } from '../../../domain/profile/hash.js';
import { programSummarySchema } from '../../../domain/university/schema.js';
import { z } from 'zod';

type ContextClient = Pick<Prisma.TransactionClient, 'profile' | 'university' | 'letterVariant'>;

export async function currentLetterContextHashes(
  client: ContextClient, profileId: string, universityId: string,
): Promise<{ profileHash: string; universityHash: string } | null> {
  const [profile, university] = await Promise.all([
    client.profile.findUnique({ where: { id: profileId }, select: { payload: true } }),
    client.university.findUnique({ where: { id: universityId },
      select: { name: true, city: true, state: true, programs: true } }),
  ]);
  if (!profile || !university) return null;
  const programs = z.array(programSummarySchema).parse(university.programs)
    .map(({ name, field }) => ({ name, field }));
  return { profileHash: createProfileHash(profile.payload),
    universityHash: createLetterUniversityHash({ name: university.name,
      ...(university.city ? { city: university.city } : {}),
      ...(university.state ? { state: university.state } : {}), programs }) };
}

export async function selectedDraftIsCurrent(
  client: ContextClient,
  letter: { id: string; profileId: string; universityId: string; selectedVariantId: string | null },
): Promise<boolean> {
  if (!letter.selectedVariantId) return false;
  const variant = await client.letterVariant.findFirst({
    where: { id: letter.selectedVariantId, generation: { letterId: letter.id } },
    include: { generation: { select: { profileHash: true, universityHash: true } } },
  });
  if (!variant?.generation.profileHash || !variant.generation.universityHash) return false;
  const current = await currentLetterContextHashes(client, letter.profileId, letter.universityId);
  return Boolean(current && current.profileHash === variant.generation.profileHash
    && current.universityHash === variant.generation.universityHash);
}
