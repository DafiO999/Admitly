import { z } from 'zod';
import type { LetterDraftProvider } from '../ports/letter-draft-provider.js';
import {
  LetterNotEditableError, LetterNotFoundError, type LetterRepository,
} from '../ports/letter-repository.js';
import type { UniversityContactRepository } from '../ports/university-contact-repository.js';
import { findSendableContact } from './admissions-contact.js';
import { normalizeGpa } from '../../domain/profile/normalize.js';
import { createProfileHash } from '../../domain/profile/hash.js';
import { createLetterUniversityHash } from '../../domain/letter/context.js';
import { parseGroundedLetterDrafts } from '../../domain/letter/draft-guard.js';
import {
  createLetterRequestSchema, generateLetterDraftsRequestSchema, letterContentRequestSchema,
  type GenerateLetterDraftsInput,
} from '../../domain/letter/schema.js';

export const LETTER_DRAFT_PROMPT_VERSION = '1';

export class InvalidReplyToError extends Error {
  constructor() { super('Invalid reply-to email'); this.name = 'InvalidReplyToError'; }
}

export class AiDraftGenerationFailedError extends Error {
  constructor(public readonly unavailable: boolean) {
    super('AI draft generation failed');
    this.name = 'AiDraftGenerationFailedError';
  }
}

export async function createLetter(
  universityId: unknown,
  requestBody: unknown,
  contacts: () => UniversityContactRepository,
  letters: () => LetterRepository,
) {
  const id = z.string().min(1).parse(universityId);
  const parsed = createLetterRequestSchema.safeParse(requestBody);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path.join('.') === 'sender.replyToEmail')) {
      throw new InvalidReplyToError();
    }
    throw parsed.error;
  }
  const repository = letters();
  const profile = await repository.findProfile(parsed.data.profileId);
  if (!profile) throw new LetterNotFoundError();
  const university = await repository.findUniversity(id);
  if (!university) throw new LetterNotFoundError();
  const contact = await findSendableContact(id, contacts);
  const letter = await repository.create({
    profileId: parsed.data.profileId,
    universityId: id,
    universityContactId: contact.id,
    purpose: parsed.data.purpose,
    senderName: parsed.data.sender.fullName,
    replyToEmail: parsed.data.sender.replyToEmail,
  });
  return { letter, recipientEmail: contact.email };
}

export async function generateLetterDrafts(
  letterId: unknown,
  requestBody: unknown,
  letters: () => LetterRepository,
  providerFactory: () => LetterDraftProvider | null,
) {
  const id = z.uuid().parse(letterId);
  const request = generateLetterDraftsRequestSchema.parse(requestBody);
  const repository = letters();
  const letter = await repository.findById(id);
  if (!letter) throw new LetterNotFoundError();
  if (!['created', 'drafts_generated', 'draft_selected'].includes(letter.status)) throw new LetterNotEditableError();
  const profile = await repository.findProfile(letter.profileId);
  const university = await repository.findUniversity(letter.universityId);
  if (!profile || !university) throw new LetterNotFoundError();
  let provider: LetterDraftProvider | null;
  try {
    provider = providerFactory();
  } catch {
    throw new AiDraftGenerationFailedError(true);
  }
  if (!provider) throw new AiDraftGenerationFailedError(true);
  const matchingProgram = university.programs.find((item) => item.field === profile.targetField);
  const input: GenerateLetterDraftsInput = {
    sender: { fullName: letter.senderName },
    profile: {
      targetField: profile.targetField,
      targetIntakeYear: profile.targetIntakeYear,
      normalizedGpa: normalizeGpa(profile.gpaValue, profile.gpaScale),
      ...(profile.englishExam ? { englishExam: profile.englishExam } : {}),
      ...(profile.sat ? { sat: profile.sat } : {}),
    },
    university: {
      name: university.name,
      ...(university.city ? { city: university.city } : {}),
      ...(university.state ? { state: university.state } : {}),
      ...(matchingProgram ? { relevantProgram: matchingProgram.name } : {}),
    },
    purpose: letter.purpose,
    ...(request.additionalContext ? { additionalContext: request.additionalContext } : {}),
  };
  let drafts;
  try {
    drafts = parseGroundedLetterDrafts(await provider.generateLetterDrafts(input), input);
  } catch {
    throw new AiDraftGenerationFailedError(false);
  }
  if (!drafts) throw new AiDraftGenerationFailedError(false);
  return repository.saveGeneration({
    letterId: id, promptVersion: LETTER_DRAFT_PROMPT_VERSION,
    profileHash: createProfileHash(profile), universityHash: createLetterUniversityHash(university),
    ...(request.additionalContext ? { additionalContext: request.additionalContext } : {}),
    inputSnapshot: input, drafts,
  });
}

export async function selectFinalLetterContent(
  letterId: unknown, requestBody: unknown, letters: () => LetterRepository,
) {
  const id = z.uuid().parse(letterId);
  const request = letterContentRequestSchema.parse(requestBody);
  const letter = await letters().saveFinalContent({ letterId: id, ...request });
  return { letter };
}
