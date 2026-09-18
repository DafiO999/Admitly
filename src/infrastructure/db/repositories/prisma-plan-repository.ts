import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient, type RoadmapItem as StoredRoadmapItem } from '@prisma/client';
import { z } from 'zod';
import {
  DatabaseUnavailableError, PlanConflictError, type GeneratedPlan, type PersistedPlan, type PersistedRoadmap,
  type PlanRepository,
} from '../../../application/ports/plan-repository.js';
import { createProfileHash } from '../../../domain/profile/hash.js';
import { normalizeGpa } from '../../../domain/profile/normalize.js';
import { studentProfileSchema } from '../../../domain/profile/schema.js';
import { recommendedUniversitySchema } from '../../../domain/recommendation/schema.js';
import { selectNextAction } from '../../../domain/roadmap/builder.js';
import {
  roadmapItemSchema, roadmapProgress, roadmapSchema, sourceCoverageSchema, type RoadmapItem, type RoadmapStatus,
} from '../../../domain/roadmap/schema.js';
import { projectRoadmapLetters } from './roadmap-letter-projection.js';

const runSnapshotSchema = z.object({
  engineVersion: z.string().min(1),
  recommendations: z.array(recommendedUniversitySchema),
  promptVersions: z.object({
    diagnosis: z.string().min(1), recommendationExplanation: z.string().min(1), roadmap: z.string().min(1),
  }).strict().optional(),
}).strict();

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDate(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function fromStoredItem(item: StoredRoadmapItem): RoadmapItem {
  return roadmapItemSchema.parse({
    id: item.key, title: item.title, category: item.category,
    priority: item.priority, status: item.status, isNextAction: item.isNextAction,
    dependsOnIds: z.array(z.string()).parse(item.dependsOnIds),
    ...(item.description ? { description: item.description } : {}),
    ...(item.dueDate ? { dueDate: item.dueDate.toISOString().slice(0, 10) } : {}),
    ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    ...(item.sourceStatus ? { sourceStatus: item.sourceStatus } : {}),
  });
}

function fromStoredRoadmap(row: {
  id: string;
  rulesVersion: string;
  selectedUniversityIds: Prisma.JsonValue;
  items: StoredRoadmapItem[];
}): PersistedRoadmap {
  const items = row.items.map(fromStoredItem);
  const nextActionId = items.find((item) => item.isNextAction)?.id ?? null;
  return {
    id: row.id,
    selectedUniversityIds: z.array(z.string().min(1)).parse(row.selectedUniversityIds),
    ...roadmapSchema.parse({ rulesVersion: row.rulesVersion, items, nextActionId,
      progress: roadmapProgress(items) }),
  };
}

export class PrismaPlanRepository implements PlanRepository {
  constructor(private readonly client: PrismaClient) {}

  async saveGenerated(input: GeneratedPlan): Promise<PersistedPlan> {
    const profile = studentProfileSchema.parse(input.profile);
    const recommendations = recommendedUniversitySchema.array().parse(input.recommendations);
    const promptVersions = runSnapshotSchema.shape.promptVersions.unwrap().parse(input.promptVersions);
    const roadmap = roadmapSchema.parse(input.roadmap);
    const sourceCoverage = sourceCoverageSchema.parse(input.sourceCoverage);
    const selectedUniversityIds = z.array(z.string().min(1)).parse(input.selectedUniversityIds);
    const profileId = profile.id ?? randomUUID();
    const storedProfile = { ...profile, id: profileId };
    const profileHash = createProfileHash(storedProfile);
    const profileData = {
      payload: json(storedProfile), profileHash, targetField: profile.targetField,
      targetIntakeYear: profile.targetIntakeYear, gpaValue: profile.gpaValue,
      gpaScale: profile.gpaScale, gpaNormalized: normalizeGpa(profile.gpaValue, profile.gpaScale),
      annualBudgetUsd: profile.annualBudgetUsd,
    };
    try {
      const saved = await this.client.$transaction(async (transaction) => {
        const previousProfile = await transaction.profile.findUnique({
          where: { id: profileId }, select: { profileHash: true },
        });
        if (input.expectedCurrentRoadmapId) {
          const current = await transaction.profile.findUnique({
            where: { id: profileId }, select: { currentRoadmapId: true },
          });
          if (current?.currentRoadmapId !== input.expectedCurrentRoadmapId) throw new PlanConflictError();
          if (input.expectedCurrentRoadmapStatuses) {
            const statuses = await transaction.roadmapItem.findMany({
              where: { roadmapId: input.expectedCurrentRoadmapId },
              select: { key: true, status: true }, orderBy: { key: 'asc' },
            });
            const expected = [...input.expectedCurrentRoadmapStatuses].sort((a, b) => a.key.localeCompare(b.key));
            if (JSON.stringify(statuses) !== JSON.stringify(expected)) throw new PlanConflictError();
          }
        }
        await transaction.profile.upsert({
          where: { id: profileId },
          create: { id: profileId, ...profileData },
          update: profileData,
        });
        if (previousProfile && previousProfile.profileHash !== profileHash) {
          await transaction.admissionLetter.updateMany({
            where: { profileId, status: { in: [
              'created', 'drafts_generated', 'draft_selected', 'ready_to_send', 'failed',
            ] } },
            data: { status: 'superseded' },
          });
        }
        const run = await transaction.recommendationRun.create({
          data: {
            profileId, profileHash, engineVersion: input.engineVersion,
            result: json({ engineVersion: input.engineVersion, recommendations, promptVersions }),
          },
        });
        const savedRoadmap = await transaction.roadmap.create({
          data: {
            profileId, recommendationRunId: run.id, profileHash,
            rulesVersion: roadmap.rulesVersion,
            selectedUniversityIds: json(selectedUniversityIds),
            sourceCoverage: json(sourceCoverage),
            items: { create: roadmap.items.map((item, position) => ({
              key: item.id, position, title: item.title, description: item.description ?? null,
              category: item.category, dueDate: toDate(item.dueDate), priority: item.priority,
              status: item.status, dependsOnIds: json(item.dependsOnIds),
              sourceUrl: item.sourceUrl ?? null, sourceStatus: item.sourceStatus ?? null,
              isNextAction: item.isNextAction,
            })) },
          },
        });
        await transaction.profile.update({
          where: { id: profileId }, data: { currentRoadmapId: savedRoadmap.id },
        });
        return { runId: run.id, roadmapId: savedRoadmap.id,
          projectedRoadmap: await projectRoadmapLetters(transaction, profileId, roadmap) };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return {
        profile: storedProfile, profileHash,
        recommendationRun: { id: saved.runId, engineVersion: input.engineVersion, recommendations, promptVersions },
        roadmap: { ...saved.projectedRoadmap, id: saved.roadmapId, selectedUniversityIds }, sourceCoverage,
      };
    } catch (error) {
      if (error instanceof PlanConflictError || (error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2034' && input.expectedCurrentRoadmapId)) throw new PlanConflictError();
      throw new DatabaseUnavailableError();
    }
  }

  async findCurrent(profileId: string): Promise<PersistedPlan | null> {
    try {
      const row = await this.client.profile.findUnique({
        where: { id: profileId },
        include: { currentRoadmap: {
          include: { recommendationRun: true, items: { orderBy: { position: 'asc' } } },
        } },
      });
      if (!row?.currentRoadmap) return null;
      const roadmap = row.currentRoadmap;
      const run = roadmap.recommendationRun;
      if (!run || roadmap.profileId !== profileId || run.profileId !== profileId
        || roadmap.profileHash !== row.profileHash || run.profileHash !== row.profileHash) {
        throw new DatabaseUnavailableError();
      }
      const profile = studentProfileSchema.parse(row.payload);
      const snapshot = runSnapshotSchema.parse(run.result);
      if (snapshot.engineVersion !== run.engineVersion || profile.id !== row.id) {
        throw new DatabaseUnavailableError();
      }
      return {
        profile: { ...profile, id: row.id }, profileHash: row.profileHash,
        recommendationRun: {
          id: run.id, engineVersion: snapshot.engineVersion, recommendations: snapshot.recommendations,
          ...(snapshot.promptVersions ? { promptVersions: snapshot.promptVersions } : {}),
        },
        roadmap: { ...await projectRoadmapLetters(this.client, row.id, fromStoredRoadmap(roadmap)),
          id: roadmap.id, selectedUniversityIds: z.array(z.string().min(1)).parse(roadmap.selectedUniversityIds) },
        sourceCoverage: sourceCoverageSchema.parse(roadmap.sourceCoverage),
      };
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async updateItemStatus(roadmapId: string, itemKey: string, status: RoadmapStatus): Promise<PersistedRoadmap | null> {
    try {
      return await this.client.$transaction(async (transaction) => {
        const row = await transaction.roadmap.findUnique({
          where: { id: roadmapId }, include: { items: { orderBy: { position: 'asc' } } },
        });
        if (!row) return null;
        const profile = await transaction.profile.findUnique({
          where: { id: row.profileId }, select: { currentRoadmapId: true },
        });
        if (profile?.currentRoadmapId !== roadmapId) return null;
        const target = row.items.find((item) => item.key === itemKey);
        if (!target) return null;
        if (target.category === 'university_email') throw new PlanConflictError();
        await transaction.roadmapItem.update({ where: { id: target.id }, data: { status } });
        const items = row.items.map((item) => fromStoredItem({
          ...item, status: item.id === target.id ? status : item.status,
          isNextAction: false,
        }));
        const nextActionId = selectNextAction(items);
        await transaction.roadmapItem.updateMany({ where: { roadmapId }, data: { isNextAction: false } });
        if (nextActionId) {
          await transaction.roadmapItem.update({
            where: { roadmapId_key: { roadmapId, key: nextActionId } },
            data: { isNextAction: true },
          });
        }
        const updatedRoadmap = roadmapSchema.parse({
          rulesVersion: row.rulesVersion, nextActionId,
          items: items.map((item) => ({ ...item, isNextAction: item.id === nextActionId })),
          progress: roadmapProgress(items),
        });
        return {
          id: row.id,
          selectedUniversityIds: z.array(z.string().min(1)).parse(row.selectedUniversityIds),
          ...await projectRoadmapLetters(transaction, row.profileId, updatedRoadmap),
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof PlanConflictError) throw error;
      throw new DatabaseUnavailableError();
    }
  }
}
