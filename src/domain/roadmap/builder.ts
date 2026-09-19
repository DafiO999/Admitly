import type { StudentProfile } from '../profile/schema.js';
import type { AdmissionRequirement } from '../university/requirement.js';
import type { University } from '../university/schema.js';
import { ROADMAP_RULES_VERSION } from '../versions.js';
import { roadmapProgress, roadmapSchema, type Roadmap, type RoadmapItem, type RoadmapStatus, type SourceCoverage } from './schema.js';

export interface RoadmapUniversity {
  university: University;
  requirements: AdmissionRequirement[];
  admissionsContact?: { email: string; sourceUrl: string; sourceStatus: 'official' | 'verified' };
}

const stageTasks: Record<StudentProfile['studentStage'], { id: string; title: string; description: string; priority: number }> = {
  grade_9_10: {
    id: 'academic:course-plan', title: 'Plan courses for the next school year',
    description: 'Choose courses that support your target field and keep your academic record strong.', priority: 90,
  },
  grade_11: {
    id: 'academic:grade-11-focus', title: 'Strengthen your grade 11 academic record',
    description: 'Review current grades and focus on subjects connected with your target field.', priority: 90,
  },
  grade_12: {
    id: 'academic:final-year-records', title: 'Keep final-year grades and records ready',
    description: 'Track final-year grades and confirm when updated academic records will be available.', priority: 90,
  },
  graduated: {
    id: 'academic:records-review', title: 'Review your completed academic records',
    description: 'Check that your completed transcript is accurate and ready for application use.', priority: 90,
  },
};

const fieldActivities: Record<StudentProfile['targetField'], { title: string; description: string }> = {
  computer_science: { title: 'Complete a small software project', description: 'Create or improve a project that demonstrates your interest in computer science.' },
  engineering: { title: 'Document an engineering project', description: 'Prepare a short description of a design, experiment, or engineering project.' },
  business: { title: 'Analyze a real business case', description: 'Choose a business problem and write a short evidence-based analysis.' },
  economics: { title: 'Complete an economics analysis', description: 'Use public data to explain one economic question related to your interests.' },
  design: { title: 'Prepare a focused design portfolio', description: 'Select and explain several works that show your design process and decisions.' },
  other: { title: 'Document a field-related project', description: 'Prepare one concrete project that demonstrates sustained interest in your chosen field.' },
};

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
    description: 'Compare tuition with your tuition budget, then check housing and other costs separately.',
    priority: 40, dependsOnIds: [],
  });
  const stageTask = stageTasks[profile.studentStage];
  const stageTaskId = `${stageTask.id}:${profile.targetField}`;
  add({ ...stageTask, id: stageTaskId, category: 'academic', dependsOnIds: [] });
  const activity = fieldActivities[profile.targetField];
  add({
    id: `activity:${profile.targetField}`, title: activity.title, category: 'activity',
    description: activity.description, priority: 65, dependsOnIds: [stageTaskId],
  });
  const knownTuition = schools.flatMap(({ university }) =>
    university.tuitionOutOfStateUsd === undefined ? [] : [university.tuitionOutOfStateUsd]);
  const minimumTuition = knownTuition.length ? Math.min(...knownTuition) : undefined;
  if (profile.annualBudgetUsd < 25_000) {
    const hasMaterialGap = minimumTuition !== undefined && minimumTuition > profile.annualBudgetUsd
      && minimumTuition - profile.annualBudgetUsd >= 5_000;
    add({
      id: hasMaterialGap ? 'research:budget-gap' : 'research:budget-limit',
      title: hasMaterialGap ? 'Resolve the tuition budget gap' : 'Verify your tuition budget assumptions',
      category: 'research',
      description: hasMaterialGap
        ? `The lowest reported annual tuition in the current shortlist is $${minimumTuition!.toLocaleString('en-US')}, above your $${profile.annualBudgetUsd.toLocaleString('en-US')} tuition budget. Review more affordable options and funding before continuing.`
        : `Your annual tuition budget is $${profile.annualBudgetUsd.toLocaleString('en-US')}. Confirm tuition for international students and plan housing, insurance, food, and transport separately.`,
      priority: 130, dependsOnIds: [],
    });
  }
  if (profile.englishExam?.status !== 'taken') {
    add({
      id: 'exam:english', title: 'Plan an English-language exam', category: 'exam',
      description: 'Choose or complete an exam and record the result in your profile.',
      priority: 120, dependsOnIds: [],
    });
  }
  if (profile.sat?.status === 'planned') {
    add({
      id: 'exam:sat', title: 'Complete your planned SAT', category: 'exam',
      description: 'Record the result after taking the planned test.',
      priority: 55, dependsOnIds: [],
    });
  }

  for (const { university, requirements, admissionsContact } of schools) {
    const verifyId = `school:${university.id}:verify`;
    add({
      id: verifyId, title: `Check requirements for ${university.name}`, category: 'research',
      description: 'Confirm current application requirements directly with the university.',
      priority: 80, dependsOnIds: ['research:programs'], sourceStatus: 'unknown',
    });
    if (admissionsContact) {
      add({
        id: `school:${university.id}:email`, title: `Prepare admissions email for ${university.name}`,
        description: 'Draft and review your message before sending it to the verified admissions contact.',
        category: 'university_email', priority: 65, dependsOnIds: [verifyId],
        sourceStatus: admissionsContact.sourceStatus, sourceUrl: admissionsContact.sourceUrl,
        letter: { universityId: university.id, recipientEmail: admissionsContact.email, body: '' },
      });
    }
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
  return { roadmap: roadmapSchema.parse({ rulesVersion: ROADMAP_RULES_VERSION, items, nextActionId,
    progress: roadmapProgress(items) }), sourceCoverage };
}
