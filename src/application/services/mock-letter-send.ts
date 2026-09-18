import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LetterDraftProvider } from '../ports/letter-draft-provider.js';
import { AiProviderError } from '../ports/ai-provider.js';
import type { PlanRepository } from '../ports/plan-repository.js';
import { parseGroundedLetterDrafts } from '../../domain/letter/draft-guard.js';
import { letterPurposeSchema, type GenerateLetterDraftsInput } from '../../domain/letter/schema.js';
import { normalizeGpa } from '../../domain/profile/normalize.js';
import { AiDraftGenerationFailedError } from './letters.js';
import { PersistedPlanNotFoundError } from './plan-persistence.js';
import { RecommendationNotFoundError } from './recommendation-explanation.js';

export const mockLetterSendRequestSchema = z.object({
  profileId: z.uuid(),
  universityId: z.string().min(1),
  senderName: z.string().trim().min(2).max(120),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
}).strict();

export const mockLetterDraftsRequestSchema = z.object({
  profileId: z.uuid(),
  universityId: z.string().min(1),
  senderName: z.string().trim().min(2).max(120),
  purpose: letterPurposeSchema,
  additionalContext: z.string().trim().min(1).max(1000).optional(),
}).strict();

async function letterContext(
  profileId: string, universityId: string, plans: () => PlanRepository,
) {
  const plan = await plans().findCurrent(profileId);
  if (!plan) throw new PersistedPlanNotFoundError();
  const recommendation = plan.recommendationRun.recommendations.find(
    (row) => row.universityId === universityId,
  );
  if (!recommendation) throw new RecommendationNotFoundError();
  return { profile: plan.profile, university: recommendation.university };
}

export async function prepareMockLetterDrafts(
  body: unknown,
  plans: () => PlanRepository,
  providerFactory: () => LetterDraftProvider | null,
) {
  const input = mockLetterDraftsRequestSchema.parse(body);
  const { profile, university } = await letterContext(input.profileId, input.universityId, plans);
  const matchingProgram = university.programs.find((item) => item.field === profile.targetField);
  const generationInput: GenerateLetterDraftsInput = {
    sender: { fullName: input.senderName },
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
    purpose: input.purpose,
    ...(input.additionalContext ? { additionalContext: input.additionalContext } : {}),
  };
  let provider: LetterDraftProvider | null;
  try {
    provider = providerFactory();
  } catch {
    throw new AiDraftGenerationFailedError(true);
  }
  if (!provider) throw new AiDraftGenerationFailedError(true);
  try {
    const drafts = parseGroundedLetterDrafts(
      await provider.generateLetterDrafts(generationInput), generationInput,
    );
    if (!drafts) throw new Error('Invalid drafts');
    return {
      variants: drafts.variants.map((variant) => ({ id: randomUUID(), ...variant })),
    };
  } catch (error) {
    throw new AiDraftGenerationFailedError(error instanceof AiProviderError
      && ['TIMEOUT', 'UNAVAILABLE', 'CONFIGURATION'].includes(error.code));
  }
}

export async function simulateLetterSend(
  body: unknown, plans: () => PlanRepository,
) {
  const input = mockLetterSendRequestSchema.parse(body);
  const { university } = await letterContext(input.profileId, input.universityId, plans);
  return {
    status: 'simulated' as const,
    simulationId: randomUUID(),
    universityId: input.universityId,
    universityName: university.name,
    subject: input.subject,
  };
}
