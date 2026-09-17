import { normalizeGpa } from '../profile/normalize.js';
import type { StudentProfile } from '../profile/schema.js';
import type { University } from '../university/schema.js';
import type { RecommendedUniversity, ScoreComponent } from './schema.js';
import { MAX_RECOMMENDATIONS, RECOMMENDATION_WEIGHTS } from './weights.js';

type Concern = RecommendedUniversity['concerns'][number];
type ScoredComponent = { component: ScoreComponent; reasonCodes: string[]; concerns: Concern[] };

function academicScore(profile: StudentProfile, university: University): ScoredComponent {
  const gpa = normalizeGpa(profile.gpaValue, profile.gpaScale);
  const gpaPoints = Math.round(gpa / 4 * 20);
  const reasons = [`Normalized GPA ${gpa}/4 contributes ${gpaPoints} of 20 academic points.`];
  const reasonCodes: string[] = ['GPA_NORMALIZED'];
  const concerns: Concern[] = [];
  let satPoints = 5;

  if (profile.sat?.status === 'taken' && university.satMedian !== undefined) {
    const difference = profile.sat.score! - university.satMedian;
    satPoints = Math.max(0, Math.min(10, 5 + Math.round(difference / 40)));
    const code = difference > 0 ? 'SAT_ABOVE_REFERENCE'
      : difference < 0 ? 'SAT_BELOW_REFERENCE' : 'SAT_AT_REFERENCE';
    reasonCodes.push(code);
    reasons.push(`SAT ${profile.sat.score} compared with the reported school median ${university.satMedian} contributes ${satPoints} of 10 academic points.`);
  } else {
    concerns.push(university.satMedian === undefined
      ? { code: 'SAT_REFERENCE_UNKNOWN', message: 'No reported school SAT reference is available.' }
      : { code: 'SAT_NOT_PROVIDED', message: 'No completed SAT score is in the profile; the SAT part is neutral.' });
    reasons.push('SAT comparison is unavailable, so the SAT part receives a neutral 5 of 10 points.');
  }

  return {
    component: { key: 'academic', score: gpaPoints + satPoints, maxScore: RECOMMENDATION_WEIGHTS.academic, reasons },
    reasonCodes, concerns,
  };
}

function programScore(): ScoredComponent {
  return {
    component: {
      key: 'program', score: RECOMMENDATION_WEIGHTS.program, maxScore: RECOMMENDATION_WEIGHTS.program,
      reasons: ['A reported bachelor program matches the target field.'],
    },
    reasonCodes: ['PROGRAM_EXACT_MATCH'], concerns: [],
  };
}

export function scoreBudget(budget: number, cost: number | undefined): number {
  if (cost === undefined) return 12;
  if (cost <= budget) return 25;
  if (cost * 100 <= budget * 115) return 20;
  if (cost * 100 <= budget * 135) return 12;
  if (cost * 100 <= budget * 160) return 5;
  return 0;
}

function budgetScore(profile: StudentProfile, university: University): ScoredComponent {
  const cost = university.tuitionOutOfStateUsd;
  const score = scoreBudget(profile.annualBudgetUsd, cost);
  if (cost === undefined) {
    return {
      component: {
        key: 'budget', score, maxScore: RECOMMENDATION_WEIGHTS.budget,
        reasons: ['Reported out-of-state tuition is unavailable; budget fit receives a neutral partial score.'],
      },
      reasonCodes: ['COST_UNKNOWN'],
      concerns: [{ code: 'COST_UNKNOWN', message: 'Confirm tuition and total annual costs with the university.' }],
    };
  }

  const withinBudget = cost <= profile.annualBudgetUsd;
  return {
    component: {
      key: 'budget', score, maxScore: RECOMMENDATION_WEIGHTS.budget,
      reasons: [`Reported out-of-state tuition is $${cost.toLocaleString('en-US')} versus a $${profile.annualBudgetUsd.toLocaleString('en-US')} annual budget.`],
    },
    reasonCodes: [withinBudget ? 'WITHIN_BUDGET' : score >= 12 ? 'NEAR_BUDGET' : 'OVER_BUDGET'],
    concerns: [{
      code: 'COST_SCOPE_LIMITED',
      message: 'Reported out-of-state tuition excludes other expenses and is not a guaranteed international-student cost.',
    }],
  };
}

function campusSize(studentSize: number): 'small' | 'medium' | 'large' {
  if (studentSize < 5_000) return 'small';
  if (studentSize <= 20_000) return 'medium';
  return 'large';
}

function preferencesScore(profile: StudentProfile, university: University): ScoredComponent {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  const concerns: Concern[] = [];
  let score = 0;

  if (!profile.preferredStates?.length) {
    score += 10;
  } else if (university.state === undefined) {
    score += 5;
    concerns.push({ code: 'STATE_UNKNOWN', message: 'School state is unavailable; state preference receives neutral points.' });
  } else if (profile.preferredStates.includes(university.state)) {
    score += 10;
    reasonCodes.push('PREFERRED_STATE');
    reasons.push(`${university.state} is a preferred state.`);
  }

  if (!profile.campusSize || profile.campusSize === 'any') {
    score += 5;
  } else if (university.studentSize === undefined) {
    score += 2;
    concerns.push({ code: 'CAMPUS_SIZE_UNKNOWN', message: 'Student size is unavailable; campus preference receives neutral points.' });
  } else if (campusSize(university.studentSize) === profile.campusSize) {
    score += 5;
    reasonCodes.push('PREFERRED_CAMPUS_SIZE');
    reasons.push(`Reported student size fits the ${profile.campusSize} campus preference.`);
  }

  return {
    component: { key: 'preferences', score, maxScore: RECOMMENDATION_WEIGHTS.preferences, reasons },
    reasonCodes, concerns,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function componentScore(result: RecommendedUniversity, key: ScoreComponent['key']): number {
  return result.components.find((component) => component.key === key)!.score;
}

export function rankUniversities(profile: StudentProfile, universities: University[]): RecommendedUniversity[] {
  if (profile.targetCountry !== 'US' || profile.targetDegree !== 'bachelor') return [];
  const unique = new Map(universities.map((university) => [university.id, university]));
  return [...unique.values()]
    .filter((university) => university.programs.some((program) =>
      program.degree === 'bachelor' && program.field === profile.targetField))
    .map((university) => {
      const scored = [
        academicScore(profile, university), programScore(), budgetScore(profile, university),
        preferencesScore(profile, university),
      ];
      const components = scored.map(({ component }) => component);
      return {
        university,
        universityId: university.id,
        fitScore: components.reduce((sum, component) => sum + component.score, 0),
        components,
        reasonCodes: scored.flatMap(({ reasonCodes }) => reasonCodes),
        concerns: [
          ...scored.flatMap(({ concerns }) => concerns),
          { code: 'REQUIREMENT_UNKNOWN', message: 'Verify admissions requirements directly with the university.' },
        ],
      };
    })
    .sort((left, right) => right.fitScore - left.fitScore
      || componentScore(right, 'program') - componentScore(left, 'program')
      || componentScore(right, 'budget') - componentScore(left, 'budget')
      || compareText(left.university.name, right.university.name)
      || compareText(left.university.id, right.university.id))
    .slice(0, MAX_RECOMMENDATIONS);
}
