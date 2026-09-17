import { studentProfileSchema, type StudyField } from '../../domain/profile/schema.js';
import { admissionRequirementSchema } from '../../domain/university/requirement.js';
import { universitySchema, type ProgramSummary } from '../../domain/university/schema.js';

function program(key: string, name: string, field: StudyField): ProgramSummary {
  return { key, name, field, degree: 'bachelor', sourceStatus: 'demo' };
}

// Fictional institutions and admissions facts. Never treat these as verified data.
export const demoUniversities = universitySchema.array().parse([
  {
    id: 'demo-redwood-state', provider: 'demo', name: 'Redwood State University',
    city: 'Sacramento', state: 'CA', studentSize: 22000,
    tuitionOutOfStateUsd: 18000, averageNetPriceUsd: 16000, satMedian: 1120,
    programs: [program('cs', 'Computer Science', 'computer_science'), program('engineering', 'Engineering', 'engineering')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-lakeside-tech', provider: 'demo', name: 'Lakeside Technical University',
    city: 'Grand Rapids', state: 'MI', studentSize: 12000,
    tuitionOutOfStateUsd: 28000, averageNetPriceUsd: 24500, satMedian: 1280,
    programs: [program('cs', 'Computer Science', 'computer_science'), program('engineering', 'Engineering', 'engineering')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-prairie-college', provider: 'demo', name: 'Prairie College',
    city: 'Topeka', state: 'KS', studentSize: 5000,
    tuitionOutOfStateUsd: 12000, averageNetPriceUsd: 11000, satMedian: 980,
    programs: [program('business', 'Business Administration', 'business'), program('economics', 'Economics', 'economics')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-atlantic-arts', provider: 'demo', name: 'Atlantic Arts College',
    city: 'Albany', state: 'NY', studentSize: 4200,
    tuitionOutOfStateUsd: 42000, satMedian: 1210,
    programs: [program('design', 'Design', 'design'), program('business', 'Business Administration', 'business')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-gulf-metropolitan', provider: 'demo', name: 'Gulf Metropolitan University',
    city: 'Houston', state: 'TX', studentSize: 31000,
    tuitionOutOfStateUsd: 23000, averageNetPriceUsd: 20500, satMedian: 1150,
    programs: [program('business', 'Business Administration', 'business'), program('cs', 'Computer Science', 'computer_science')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-summit-institute', provider: 'demo', name: 'Summit Institute of Technology',
    city: 'Fort Collins', state: 'CO', studentSize: 9000,
    tuitionOutOfStateUsd: 35000, averageNetPriceUsd: 32000, satMedian: 1380,
    programs: [program('engineering', 'Engineering', 'engineering'), program('design', 'Design', 'design')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-northeast-research', provider: 'demo', name: 'Northeast Research University',
    city: 'Worcester', state: 'MA', studentSize: 18000,
    tuitionOutOfStateUsd: 55000, averageNetPriceUsd: 48000, satMedian: 1480,
    programs: [program('cs', 'Computer Science', 'computer_science'), program('economics', 'Economics', 'economics')],
    sourceStatus: 'demo',
  },
  {
    id: 'demo-riverbend', provider: 'demo', name: 'Riverbend University',
    city: 'Eugene', state: 'OR', studentSize: 14000,
    tuitionOutOfStateUsd: 26000, averageNetPriceUsd: 23500,
    programs: [program('economics', 'Economics', 'economics'), program('business', 'Business Administration', 'business'), program('design', 'Design', 'design')],
    sourceStatus: 'demo',
  },
]);

const demoDeadlines = [
  '2028-01-15', '2028-02-01', '2028-03-01', '2027-12-01',
  '2028-02-15', '2028-01-10', '2027-11-15', '2028-03-15',
];

export const demoRequirements = admissionRequirementSchema.array().parse(
  demoUniversities.flatMap((university, index) => [
    {
      id: `${university.id}-deadline`, universityId: university.id,
      kind: 'application_deadline', label: 'Demo application deadline',
      valueText: `Demo deadline for 2028 intake: ${demoDeadlines[index]}`,
      date: demoDeadlines[index], sourceStatus: 'demo',
    },
    {
      id: `${university.id}-english`, universityId: university.id,
      kind: 'english', label: 'Demo English exam requirement',
      valueText: 'Demo: submit an English-language test score',
      sourceStatus: 'demo',
    },
  ]),
);

export const canonicalDemoProfile = studentProfileSchema.parse({
  targetCountry: 'US', targetDegree: 'bachelor', targetField: 'computer_science',
  targetIntakeYear: 2028, gpaValue: 3.6, gpaScale: 4,
  englishExam: { type: 'IELTS', status: 'taken', score: 7 },
  sat: { status: 'taken', score: 1240 },
  annualBudgetUsd: 26000, preferredStates: ['CA', 'TX'], campusSize: 'any',
});
