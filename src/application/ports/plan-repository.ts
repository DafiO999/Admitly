import type { StudentProfile } from '../../domain/profile/schema.js';
import type { RecommendedUniversity } from '../../domain/recommendation/schema.js';
import type { Roadmap, RoadmapStatus, SourceCoverage } from '../../domain/roadmap/schema.js';

export interface GeneratedPlan {
  profile: StudentProfile;
  engineVersion: string;
  recommendations: RecommendedUniversity[];
  roadmap: Roadmap;
  sourceCoverage: SourceCoverage;
  selectedUniversityIds: string[];
  promptVersions: PromptVersions;
  expectedCurrentRoadmapId?: string;
  expectedCurrentRoadmapStatuses?: { key: string; status: RoadmapStatus }[];
}

export interface PromptVersions {
  diagnosis: string;
  recommendationExplanation: string;
  roadmap: string;
}

export interface PersistedRoadmap extends Roadmap {
  id: string;
  selectedUniversityIds: string[];
}

export interface PersistedPlan {
  profile: StudentProfile & { id: string };
  profileHash: string;
  recommendationRun: {
    id: string;
    engineVersion: string;
    recommendations: RecommendedUniversity[];
    promptVersions?: PromptVersions;
  };
  roadmap: PersistedRoadmap;
  sourceCoverage: SourceCoverage;
}

export interface PlanRepository {
  saveGenerated(plan: GeneratedPlan): Promise<PersistedPlan>;
  findCurrent(profileId: string): Promise<PersistedPlan | null>;
  updateItemStatus(roadmapId: string, itemKey: string, status: RoadmapStatus): Promise<PersistedRoadmap | null>;
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super('Database unavailable');
    this.name = 'DatabaseUnavailableError';
  }
}

export class PlanConflictError extends Error {
  constructor() {
    super('Current plan changed during recalculation');
    this.name = 'PlanConflictError';
  }
}
