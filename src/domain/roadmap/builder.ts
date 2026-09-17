import type { StudentProfile } from '../profile/schema.js';
import type { AdmissionRequirement } from '../university/requirement.js';
import type { University } from '../university/schema.js';
import { ROADMAP_RULES_VERSION } from '../versions.js';
import { roadmapSchema, type Roadmap, type RoadmapItem, type RoadmapStatus, type SourceCoverage } from './schema.js';

export interface RoadmapUniversity {
  university: University;
  requirements: AdmissionRequirement[];
}

function relevantRequirement(
  requirement: AdmissionRequirement, university: University, profile: StudentProfile,
): boolean {
  if (requirement.universityId !== university.id) return false;
  if (!requirement.programKey) return true;
  return university.programs.some((program) =>
    program.key === requirement.programKey && program.field === profile.targetField);
}

function dateForIntake(requirement: AdmissionRequirement, intakeYear: number): string | undefined {
  if (!requirement.date) return undefined;
  const statedIntakeYear = /\b(20\d{2})\s+intake\b/i.exec(requirement.valueText)?.[1];
  if (statedIntakeYear && Number(statedIntakeYear) !== intakeYear) return undefined;
  const dateYear = Number(requirement.date.slice(0, 4));
  return dateYear === intakeYear || dateYear === intakeYear - 1 ? requirement.date : undefined;
}

function categoryFor(requirement: AdmissionRequirement): RoadmapItem['category'] {
  switch (requirement.kind) {
    case 'english':
    case 'sat_act': return 'exam';
    case 'document': return 'document';
    case 'gpa': return 'academic';
    case 'application_deadline': return 'application';
    case 'other': return 'research';
  }
}

function requirementDependencies(requirement: AdmissionRequirement, schoolId: string, profile: StudentProfile): string[] {
  const dependencies = [`school:${schoolId}:verify`];
  if (requirement.kind === 'english' && profile.englishExam?.status !== 'taken') {
    dependencies.push('exam:english');
  }
  if (requirement.kind === 'sat_act' && profile.sat?.status === 'planned') {
    dependencies.push('exam:sat');
  }
  if (requirement.kind === 'document') dependencies.push('document:academic-records');
  return dependencies;
}

export function selectNextAction(items: RoadmapItem[]): string | null {
  const byId = new Map(items.map((item) => [item.id, item]));
  const actionable = items.filter((item) =>
    (item.status === 'pending' || item.status === 'in_progress')
    && item.dependsOnIds.every((id) => byId.get(id)?.status === 'done'));
  actionable.sort((left, right) => {
    if (left.dueDate && right.dueDate && left.dueDate !== right.dueDate) {
      return left.dueDate < right.dueDate ? -1 : 1;
    }
    if (left.dueDate !== right.dueDate) return left.dueDate ? -1 : 1;
    if (left.status !== right.status) return left.status === 'in_progress' ? -1 : 1;
    return right.priority - left.priority || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  });
  return actionable[0]?.id ?? null;
}

export function buildRoadmap(
  profile: StudentProfile,
  schools: RoadmapUniversity[],
  statuses: Readonly<Record<string, RoadmapStatus>> = {},
): { roadmap: Roadmap; sourceCoverage: SourceCoverage } {
  const items: RoadmapItem[] = [];
  const sourceCoverage: SourceCoverage = { official: 0, verified: 0, demo: 0, unknown: 0 };
  const add = (item: Omit<RoadmapItem, 'status' | 'isNextAction'>) => {
    items.push({ ...item, status: statuses[item.id] ?? 'pending', isNextAction: false });
  };
  add({
    id: 'research:programs', title: 'Review selected bachelor programs', category: 'research',
    description: 'Confirm each program matches your target field and intake.',
    priority: 60, dependsOnIds: [],
  });
  add({
    id: 'document:academic-records', title: 'Prepare academic records', category: 'document',
    description: 'Gather your academic records for the selected applications.',
    priority: 50, dependsOnIds: [],
  });
  add({
    id: 'research:budget', title: 'Review your application budget', category: 'research',
    description: 'Check total costs directly with each university before committing.',
    priority: 40, dependsOnIds: [],
  });
  if (profile.englishExam?.status !== 'taken') {
    add({
      id: 'exam:english', title: 'Plan an English-language exam', category: 'exam',
      description: 'Choose or complete an exam and record the result in your profile.',
      priority: 75, dependsOnIds: [],
    });
  }
  if (profile.sat?.status === 'planned') {
    add({
      id: 'exam:sat', title: 'Complete your planned SAT', category: 'exam',
      description: 'Record the result after taking the planned test.',
      priority: 55, dependsOnIds: [],
    });
  }

  for (const { university, requirements } of schools) {
    const verifyId = `school:${university.id}:verify`;
    add({
      id: verifyId, title: `Check requirements for ${university.name}`, category: 'research',
      description: 'Confirm current application requirements directly with the university.',
      priority: 80, dependsOnIds: ['research:programs'], sourceStatus: 'unknown',
    });
    const relevant = requirements.filter((requirement) => relevantRequirement(requirement, university, profile))
      .filter((requirement) => requirement.kind !== 'application_deadline'
        || !requirement.date || dateForIntake(requirement, profile.targetIntakeYear) !== undefined)
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    for (const requirement of relevant) sourceCoverage[requirement.sourceStatus] += 1;

    const preparationIds: string[] = [];
    const deadlines: AdmissionRequirement[] = [];
    for (const requirement of relevant) {
      if (requirement.kind === 'application_deadline') {
        deadlines.push(requirement);
        continue;
      }
      const id = `school:${university.id}:requirement:${requirement.id}`;
      preparationIds.push(id);
      add({
        id, title: `Review ${requirement.label} for ${university.name}`,
        description: requirement.valueText, category: categoryFor(requirement),
        priority: 70, dependsOnIds: requirementDependencies(requirement, university.id, profile),
        sourceStatus: requirement.sourceStatus,
        ...(requirement.sourceUrl ? { sourceUrl: requirement.sourceUrl } : {}),
      });
    }
    if (deadlines.every((deadline) => dateForIntake(deadline, profile.targetIntakeYear) === undefined)) {
      sourceCoverage.unknown += 1;
    }
    const applicationDependencies = [verifyId, 'document:academic-records', ...preparationIds];
    if (deadlines.length === 0) {
      add({
        id: `school:${university.id}:apply`, title: `Prepare application for ${university.name}`,
        description: 'Confirm the application deadline directly with the university before applying.',
        category: 'application', priority: 100, dependsOnIds: applicationDependencies,
        sourceStatus: 'unknown',
      });
    } else {
      for (const deadline of deadlines) {
        const dueDate = dateForIntake(deadline, profile.targetIntakeYear);
        add({
          id: `school:${university.id}:deadline:${deadline.id}`,
          title: `Prepare application for ${university.name}: ${deadline.label}`,
          description: deadline.valueText, category: 'application', priority: 100,
          dependsOnIds: applicationDependencies, sourceStatus: deadline.sourceStatus,
          ...(deadline.sourceUrl ? { sourceUrl: deadline.sourceUrl } : {}),
          ...(dueDate ? { dueDate } : {}),
        });
      }
    }
  }
  const nextActionId = selectNextAction(items);
  for (const item of items) item.isNextAction = item.id === nextActionId;
  return { roadmap: roadmapSchema.parse({ rulesVersion: ROADMAP_RULES_VERSION, items, nextActionId }), sourceCoverage };
}
