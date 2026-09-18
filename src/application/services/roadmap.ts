import { z } from 'zod';
import type { AdmissionRequirementProvider } from '../ports/admission-requirement-provider.js';
import type { AiProvider } from '../ports/ai-provider.js';
import type { UniversityContactRepository } from '../ports/university-contact-repository.js';
import { UniversityProviderError, type UniversityProvider } from '../ports/university-provider.js';
import { isGroundedRoadmapRewrite } from './ai-guard.js';
import { studentProfileSchema } from '../../domain/profile/schema.js';
import { buildRoadmap } from '../../domain/roadmap/builder.js';
import { roadmapSchema } from '../../domain/roadmap/schema.js';
import { admissionRequirementSchema } from '../../domain/university/requirement.js';
import { universitySchema } from '../../domain/university/schema.js';
import { selectSendableContact } from '../../domain/university/contact.js';
import { ROADMAP_PROMPT_VERSION } from '../../domain/versions.js';

export const roadmapRequestSchema = z.object({
  profile: studentProfileSchema,
  selectedUniversityIds: z.array(z.string().min(1)).min(1).max(3).refine((ids) => new Set(ids).size === ids.length, {
    message: 'University IDs must be unique',
  }),
  enhanceWithAi: z.boolean().optional(),
}).strict();

const rewrittenItemsSchema = z.array(z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(300).optional(),
}).strict()).max(50);

export interface RoadmapProviders {
  universityProvider: UniversityProvider;
  requirementProvider: AdmissionRequirementProvider;
}

export class RoadmapUniversityNotFoundError extends Error {
  constructor() {
    super('Requested university not found');
    this.name = 'RoadmapUniversityNotFoundError';
  }
}

export class RoadmapProgramMismatchError extends Error {
  constructor() {
    super('Selected university has no matching bachelor program');
    this.name = 'RoadmapProgramMismatchError';
  }
}

export async function createRoadmap(
  input: unknown,
  providerFactory: () => RoadmapProviders,
  aiProviderFactory: () => AiProvider | null,
  contactRepositoryFactory: () => UniversityContactRepository | null = () => null,
) {
  const { profile, selectedUniversityIds, enhanceWithAi } = roadmapRequestSchema.parse(input);
  const { universityProvider, requirementProvider } = providerFactory();
  const loaded = await Promise.all(selectedUniversityIds.map((id) => universityProvider.getById(id)));
  if (loaded.some((university) => university === null)) throw new RoadmapUniversityNotFoundError();
  const universities = universitySchema.array().safeParse(loaded);
  if (!universities.success || universities.data.some((university, index) => university.id !== selectedUniversityIds[index])) {
    throw new UniversityProviderError('INVALID_RESPONSE');
  }
  if (universities.data.some((university) => !university.programs.some((program) =>
    program.degree === 'bachelor' && program.field === profile.targetField))) {
    throw new RoadmapProgramMismatchError();
  }
  const requirements = admissionRequirementSchema.array().safeParse(
    await requirementProvider.listByUniversityIds(selectedUniversityIds),
  );
  if (!requirements.success || requirements.data.some((requirement) =>
    !selectedUniversityIds.includes(requirement.universityId))
    || new Set(requirements.data.map((requirement) => requirement.id)).size !== requirements.data.length) {
    throw new UniversityProviderError('INVALID_RESPONSE');
  }
  const contactRepository = contactRepositoryFactory();
  const contacts = contactRepository
    ? await Promise.all(selectedUniversityIds.map((id) => contactRepository.findByUniversityId(id))) : [];
  const schools = universities.data.map((university, index) => {
    const contact = selectSendableContact(university.id, contacts[index] ?? []);
    return { university, requirements: requirements.data,
      ...(contact ? { admissionsContact: { email: contact.email, sourceUrl: contact.sourceUrl,
        sourceStatus: contact.sourceStatus } } : {}) };
  });
  const { roadmap, sourceCoverage } = buildRoadmap(profile, schools);
  const fallback = { roadmap, sourceCoverage, mode: 'rules' as const };
  if (!enhanceWithAi) return fallback;

  try {
    const provider = aiProviderFactory();
    if (!provider) return fallback;
    const editable = roadmap.items.filter((item) => !item.sourceStatus || item.sourceStatus === 'unknown');
    const candidate = rewrittenItemsSchema.safeParse(await provider.rewriteRoadmap(editable.map((item) => ({
      id: item.id, title: item.title, ...(item.description ? { description: item.description } : {}),
    }))));
    if (!candidate.success || candidate.data.length !== editable.length
      || candidate.data.some((item, index) => {
        const original = editable[index]!;
        return item.id !== original.id || Boolean(item.description) !== Boolean(original.description)
          || !isGroundedRoadmapRewrite(
            [item.title, ...(item.description ? [item.description] : [])],
            [original.title, ...(original.description ? [original.description] : [])],
          );
      })) return fallback;
    const rewrites = new Map(candidate.data.map((item) => [item.id, item]));
    const revised = roadmapSchema.parse({
      ...roadmap,
      items: roadmap.items.map((item) => {
        const wording = rewrites.get(item.id);
        return wording ? { ...item, title: wording.title, description: wording.description } : item;
      }),
    });
    return { roadmap: revised, sourceCoverage, mode: 'gemini' as const, promptVersion: ROADMAP_PROMPT_VERSION };
  } catch {
    return fallback;
  }
}
