import type { StudentProfile } from '../profile/schema.js';
import { selectNextAction } from './builder.js';
import { roadmapProgress, roadmapSchema, type Roadmap, type RoadmapItem } from './schema.js';

function sameTask(left: RoadmapItem, right: RoadmapItem): boolean {
  const stable = (item: RoadmapItem) => ({
    id: item.id, title: item.title, description: item.description,
    category: item.category, priority: item.priority, dueDate: item.dueDate,
    dependsOnIds: item.dependsOnIds, sourceUrl: item.sourceUrl, sourceStatus: item.sourceStatus,
    letterUniversityId: item.letter?.universityId, letterRecipientEmail: item.letter?.recipientEmail,
  });
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function preserveCompletedTasks(
  previous: Roadmap,
  next: Roadmap,
  oldProfile: StudentProfile,
  newProfile: StudentProfile,
  oldSelectedIds: string[],
  newSelectedIds: string[],
): Roadmap {
  if (previous.rulesVersion !== next.rulesVersion) return next;
  const oldById = new Map(previous.items.map((item) => [item.id, item]));
  const sameSelection = JSON.stringify([...oldSelectedIds].sort()) === JSON.stringify([...newSelectedIds].sort());
  const sameProgramContext = oldProfile.targetField === newProfile.targetField
    && oldProfile.targetIntakeYear === newProfile.targetIntakeYear;
  const candidates = new Set(next.items.filter((item) => {
    const old = oldById.get(item.id);
    if (!old || old.status !== 'done' || !sameTask(old, item)) return false;
    if (item.id === 'research:programs') return sameProgramContext && sameSelection;
    if (item.id === 'research:budget') {
      return sameSelection && oldProfile.annualBudgetUsd === newProfile.annualBudgetUsd;
    }
    if (item.id === 'exam:english') {
      return JSON.stringify(oldProfile.englishExam) === JSON.stringify(newProfile.englishExam);
    }
    if (item.id === 'exam:sat') return JSON.stringify(oldProfile.sat) === JSON.stringify(newProfile.sat);
    if (item.id.startsWith('school:')) {
      return sameProgramContext && JSON.stringify(oldProfile.sat) === JSON.stringify(newProfile.sat)
        && JSON.stringify(oldProfile.englishExam) === JSON.stringify(newProfile.englishExam);
    }
    return true;
  }).map((item) => item.id));

  // A completed task is no longer safe to carry forward if a prerequisite was reopened.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of next.items) {
      if (item.category !== 'university_email' && candidates.has(item.id)
        && item.dependsOnIds.some((id) => !candidates.has(id))) {
        candidates.delete(item.id);
        changed = true;
      }
    }
  }
  const items = next.items.map((item) => ({
    ...item, status: candidates.has(item.id) ? 'done' as const : 'pending' as const, isNextAction: false,
  }));
  const nextActionId = selectNextAction(items);
  return roadmapSchema.parse({
    rulesVersion: next.rulesVersion, nextActionId,
    items: items.map((item) => ({ ...item, isNextAction: item.id === nextActionId })),
    progress: roadmapProgress(items),
  });
}
