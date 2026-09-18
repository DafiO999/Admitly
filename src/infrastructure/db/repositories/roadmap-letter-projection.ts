import { Prisma } from '@prisma/client';
import { selectSendableContact } from '../../../domain/university/contact.js';
import { roadmapSchema, type Roadmap } from '../../../domain/roadmap/schema.js';
import { selectedDraftIsCurrent } from './letter-context.js';
import { toUniversityContact } from './prisma-university-contact-repository.js';

type ProjectionClient = Pick<Prisma.TransactionClient,
  'universityContact' | 'admissionLetter' | 'profile' | 'university' | 'letterVariant'>;

function emailUniversityId(key: string): string | null {
  return /^school:(.+):email$/.exec(key)?.[1] ?? null;
}

export async function projectRoadmapLetters(
  client: ProjectionClient, profileId: string, roadmap: Roadmap,
): Promise<Roadmap> {
  const emailItems = roadmap.items.filter((item) => item.category === 'university_email');
  const universityIds = [...new Set(emailItems.map((item) => emailUniversityId(item.id)).filter((id): id is string => Boolean(id)))];
  if (universityIds.length === 0) return roadmap;
  const [contactRows, letters] = await Promise.all([
    client.universityContact.findMany({ where: { universityId: { in: universityIds }, active: true } }),
    client.admissionLetter.findMany({
      where: { profileId, universityId: { in: universityIds }, body: { not: null },
        selectedVariantId: { not: null },
        status: { in: ['draft_selected', 'ready_to_send', 'sending', 'sent', 'failed'] } },
      include: { sendAttempts: { where: { status: 'accepted' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1 } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    }),
  ]);
  const contacts = contactRows.map(toUniversityContact).filter((contact) => contact !== null);
  const items = await Promise.all(roadmap.items.map(async (item) => {
    if (item.category !== 'university_email') return item;
    const universityId = emailUniversityId(item.id);
    if (!universityId) return item;
    const contact = selectSendableContact(universityId, contacts);
    const candidates = letters.filter((letter) => letter.universityId === universityId);
    const preferred = item.status === 'done'
      ? [...candidates.filter((letter) => letter.status === 'sent'), ...candidates.filter((letter) => letter.status !== 'sent')]
      : candidates.filter((letter) => letter.status !== 'sent');
    let chosen: typeof letters[number] | undefined;
    for (const letter of preferred) {
      if (letter.status === 'sent' || await selectedDraftIsCurrent(client, letter)) {
        chosen = letter;
        break;
      }
    }
    const acceptedRecipient = chosen?.status === 'sent' ? chosen.sendAttempts[0]?.recipientEmail : undefined;
    const recipientEmail = acceptedRecipient ?? contact?.email;
    const withoutLetter = { ...item };
    delete withoutLetter.letter;
    if (!recipientEmail) return withoutLetter;
    return { ...withoutLetter, letter: { universityId, recipientEmail, body: chosen?.body ?? '' } };
  }));
  return roadmapSchema.parse({ rulesVersion: roadmap.rulesVersion, items,
    nextActionId: roadmap.nextActionId, progress: roadmap.progress });
}
