import { normalizeGpa } from '../profile/normalize.js';
import type { StudentProfile, StudyField } from '../profile/schema.js';
import type { Diagnosis } from './schema.js';

const fieldNames: Record<StudyField, string> = {
  computer_science: 'computer science',
  engineering: 'engineering',
  business: 'business',
  economics: 'economics',
  design: 'design',
  other: 'another field',
};

const STRONG_GPA = 3.5;
const LOW_GPA = 3;
const BUDGET_PLANNING_THRESHOLD_USD = 25_000;

export function diagnoseProfile(profile: StudentProfile): Diagnosis {
  const gpa = normalizeGpa(profile.gpaValue, profile.gpaScale);
  const budget = profile.annualBudgetUsd.toLocaleString('en-US');
  const strengths: string[] = [];
  const constraints: string[] = [];
  const focusNow: string[] = [];

  if (gpa >= STRONG_GPA) {
    strengths.push(`Your normalized GPA is ${gpa}/4, at or above the ${STRONG_GPA}/4 planning threshold.`);
  } else if (gpa < LOW_GPA) {
    constraints.push(`Your normalized GPA is ${gpa}/4, below the ${LOW_GPA}/4 planning threshold.`);
    focusNow.push('Review programs against your current GPA.');
  }

  if (profile.englishExam?.status === 'taken') {
    strengths.push(`Your ${profile.englishExam.type} score is ${profile.englishExam.score}.`);
  } else {
    constraints.push(profile.englishExam?.status === 'planned'
      ? `Your ${profile.englishExam.type} exam is planned; no score is available yet.`
      : 'No completed English exam score is in your profile.');
    focusNow.push(profile.englishExam?.status === 'planned'
      ? `Complete your planned ${profile.englishExam.type} exam and add the score.`
      : 'Decide which English exam to take and add a plan to your profile.');
  }

  if (profile.sat?.status === 'taken') {
    strengths.push(`You have an SAT score of ${profile.sat.score}.`);
  } else {
    focusNow.push(profile.sat?.status === 'planned'
      ? 'Complete your planned SAT and add the score.'
      : 'Check whether your target programs consider the SAT before planning a test.');
  }

  if (profile.annualBudgetUsd < BUDGET_PLANNING_THRESHOLD_USD) {
    constraints.push(`Your annual budget of $${budget} is below the $25,000 planning threshold.`);
    focusNow.push(`Compare program costs with your $${budget} annual budget.`);
  }

  focusNow.push(`Review bachelor’s programs in ${fieldNames[profile.targetField]} for ${profile.targetIntakeYear} intake.`);

  return {
    goalSummary: `You aim to study ${fieldNames[profile.targetField]} for a bachelor’s degree in the US, starting in ${profile.targetIntakeYear}.`,
    strengths,
    constraints,
    focusNow,
  };
}
