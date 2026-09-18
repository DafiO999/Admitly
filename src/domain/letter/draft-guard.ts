import { generatedLetterDraftsSchema, type GeneratedLetterDrafts, type GenerateLetterDraftsInput } from './schema.js';

const fieldNames: Record<GenerateLetterDraftsInput['profile']['targetField'], string> = {
  computer_science: 'Computer Science', engineering: 'Engineering', business: 'Business',
  economics: 'Economics', design: 'Design', other: 'undergraduate study',
};

const questions: Record<GenerateLetterDraftsInput['purpose'], string> = {
  admissions_inquiry: 'Could you share information about the undergraduate admissions process?',
  application_follow_up: 'Could you advise how I may follow up on an undergraduate application?',
  document_submission: 'Could you advise how supporting documents should be submitted?',
  achievement_update: 'Could you advise how an applicant may share an achievement update?',
  program_question: 'Could you share more information about the undergraduate program?',
  general: 'Could you direct me to the appropriate admissions information?',
};

export function letterDraftSentenceBank(input: GenerateLetterDraftsInput, contextSentence?: string): {
  subjects: string[]; lines: string[];
} {
  const school = input.university.name;
  const field = input.university.relevantProgram ?? fieldNames[input.profile.targetField];
  const lines = [
    'Dear Admissions Team,',
    `My name is ${input.sender.fullName}, and I am interested in undergraduate study at ${school}.`,
    `I am interested in ${field} for the ${input.profile.targetIntakeYear} intake.`,
    `I am currently preparing for undergraduate applications for the ${input.profile.targetIntakeYear} intake.`,
  ];
  if (contextSentence) lines.push(contextSentence);
  if (input.profile.englishExam?.status === 'taken' && input.profile.englishExam.score !== undefined) {
    lines.push(`My ${input.profile.englishExam.type} score is ${input.profile.englishExam.score}.`);
  }
  if (input.profile.sat?.status === 'taken' && input.profile.sat.score !== undefined) {
    lines.push(`My SAT score is ${input.profile.sat.score}.`);
  }
  lines.push(questions[input.purpose], 'I would appreciate any guidance you can provide.',
    'Thank you for your time and guidance.', 'Sincerely,', input.sender.fullName);
  return {
    subjects: [
      `Undergraduate admissions inquiry for ${school}`,
      `Question about ${field} at ${school}`,
      `Undergraduate application question for ${school}`,
    ],
    lines,
  };
}

export function parseGroundedLetterDrafts(output: unknown, input: GenerateLetterDraftsInput): GeneratedLetterDrafts | null {
  const parsed = generatedLetterDraftsSchema.safeParse(output);
  if (!parsed.success) return null;
  const contextSentence = parsed.data.contextSentence;
  if (Boolean(input.additionalContext) !== Boolean(contextSentence)) return null;
  if (contextSentence && (/\p{Script=Cyrillic}/u.test(contextSentence)
    || !/[A-Za-z]/.test(contextSentence) || !/[.!?]$/.test(contextSentence))) return null;
  const bank = letterDraftSentenceBank(input, contextSentence);
  const subjects = new Set(bank.subjects);
  const lines = new Set(bank.lines);
  const bodies = new Set<string>();
  let previousLength = 0;
  for (const draft of parsed.data.variants) {
    if (!subjects.has(draft.subject)) return null;
    const bodyLines = draft.body.split(/\r?\n/).filter((line) => line.length > 0);
    if (bodyLines.length === 0 || bodyLines.some((line) => !lines.has(line))) return null;
    const positions = bodyLines.map((line) => bank.lines.indexOf(line));
    if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) return null;
    if (bodyLines[0] !== 'Dear Admissions Team,' || bodyLines.at(-2) !== 'Sincerely,'
      || bodyLines.at(-1) !== input.sender.fullName
      || !bodyLines.includes(bank.lines[1]!)
      || !bodyLines.includes(questions[input.purpose])
      || bodyLines.length <= previousLength) return null;
    if (contextSentence && !bodyLines.includes(contextSentence)) return null;
    if (draft.variant === 'detailed' && bodyLines.length !== bank.lines.length) return null;
    previousLength = bodyLines.length;
    if (bodies.has(draft.body)) return null;
    bodies.add(draft.body);
  }
  return parsed.data;
}
