import { z } from 'zod';
import type { StudyField } from '../../domain/profile/schema.js';
import { universitySchema, type ProgramSummary, type University } from '../../domain/university/schema.js';

export const scorecardResponseSchema = z.object({ results: z.array(z.unknown()) }).passthrough();

const scorecardRecordSchema = z.object({
  id: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]),
  'school.name': z.string().trim().min(1),
}).catchall(z.unknown());

const scorecardProgramSchema = z.object({
  code: z.string().regex(/^\d{4}$/),
  title: z.string().trim().min(1),
  credential: z.object({ level: z.number().int() }).passthrough(),
}).passthrough();

const optionalText = z.string().trim().min(1);
const optionalState = z.string().regex(/^[A-Z]{2}$/);
const optionalCount = z.number().int().nonnegative();
const optionalRate = z.number().min(0).max(1);
const optionalSat = z.number().int().min(400).max(1600);

function optionalValue<T>(schema: z.ZodType<T>, value: unknown): T | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function websiteUrl(value: unknown): string | undefined {
  const text = optionalValue(optionalText, value);
  if (!text) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
      ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function fieldForCip(code: string): StudyField {
  if (code.startsWith('11')) return 'computer_science';
  if (code.startsWith('14')) return 'engineering';
  if (code === '4506') return 'economics';
  if (code.startsWith('52')) return 'business';
  if (code === '5004') return 'design';
  return 'other';
}

function mapPrograms(value: unknown, sourceUrl: string): ProgramSummary[] {
  if (!Array.isArray(value)) return [];
  const programs = new Map<string, ProgramSummary>();
  for (const item of value) {
    const result = scorecardProgramSchema.safeParse(item);
    if (!result.success || result.data.credential.level !== 3) continue;
    const { code, title } = result.data;
    programs.set(code, {
      key: code, name: title, field: fieldForCip(code), degree: 'bachelor',
      sourceStatus: 'official', sourceUrl,
    });
  }
  return [...programs.values()];
}

export function mapScorecardUniversity(value: unknown, year?: number): University | null {
  const parsed = scorecardRecordSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  const prefix = year === undefined ? 'latest' : String(year);
  const id = String(row.id);
  const sourceUrl = `https://api.data.gov/ed/collegescorecard/v1/schools?id=${id}`;
  const programs = mapPrograms(row['latest.programs.cip_4_digit'], sourceUrl);
  if (programs.length === 0) return null;

  const university = {
    id: `scorecard-${id}`,
    provider: 'college_scorecard' as const,
    name: row['school.name'],
    city: optionalValue(optionalText, row['school.city']),
    state: optionalValue(optionalState, row['school.state']),
    websiteUrl: websiteUrl(row['school.school_url']),
    studentSize: optionalValue(optionalCount, row[`${prefix}.student.size`]),
    admissionRate: optionalValue(optionalRate, row[`${prefix}.admissions.admission_rate.overall`]),
    tuitionOutOfStateUsd: optionalValue(optionalCount, row[`${prefix}.cost.tuition.out_of_state`]),
    averageNetPriceUsd: optionalValue(optionalCount, row[`${prefix}.cost.avg_net_price.overall`]),
    satMedian: optionalValue(optionalSat, row[`${prefix}.admissions.sat_scores.average.overall`]),
    programs,
    dataYear: year,
    sourceUrl,
    sourceStatus: 'official' as const,
  };

  const normalized = universitySchema.safeParse(Object.fromEntries(
    Object.entries(university).filter(([, field]) => field !== undefined),
  ));
  return normalized.success ? normalized.data : null;
}
