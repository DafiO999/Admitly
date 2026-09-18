import { z } from 'zod';
import {
  UniversityProviderError, type UniversityProvider, type UniversitySearchInput,
} from '../../application/ports/university-provider.js';
import type { University } from '../../domain/university/schema.js';
import { ExternalTimeoutError, withTimeout } from '../http/with-timeout.js';
import { mapScorecardUniversity, scorecardResponseSchema } from './mapper.js';

const BASE_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const FIELDS = [
  'id', 'school.name', 'school.city', 'school.state', 'school.school_url',
  'student.size', 'admissions.admission_rate.overall',
  'cost.tuition.out_of_state', 'cost.avg_net_price.overall',
];
const FIELD_CIP_FILTER: Record<Exclude<NonNullable<UniversitySearchInput['field']>, 'other'>, [string, string]> = {
  computer_science: ['latest.programs.cip_4_digit.code__range', '1100..1199'],
  engineering: ['latest.programs.cip_4_digit.code__range', '1400..1499'],
  business: ['latest.programs.cip_4_digit.code__range', '5200..5299'],
  economics: ['latest.programs.cip_4_digit.code', '4506'],
  design: ['latest.programs.cip_4_digit.code', '5004'],
};

const searchSchema = z.object({
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  states: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(10).optional(),
  field: z.enum(['computer_science', 'engineering', 'business', 'economics', 'design', 'other']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
}).strict().refine((input) => !input.state || !input.states, { message: 'Choose state or states' });

export interface CollegeScorecardOptions {
  apiKey: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}

export class CollegeScorecardProvider implements UniversityProvider {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetcher: typeof fetch;

  constructor(options: CollegeScorecardOptions) {
    if (!options.apiKey.trim()) throw new UniversityProviderError('CONFIGURATION');
    if (options.timeoutMs !== undefined && (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1)) {
      throw new UniversityProviderError('CONFIGURATION');
    }
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async search(input: UniversitySearchInput): Promise<University[]> {
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) throw new UniversityProviderError('INVALID_REQUEST');
    const { state, states, field, limit = 20, year } = parsed.data;
    const url = this.createUrl(year);
    url.searchParams.set('per_page', String(limit));
    if (state) url.searchParams.set('school.state', state);
    else if (states) url.searchParams.set('school.state', states.join(','));
    else url.searchParams.set('sort', 'latest.student.size:desc');
    // Filter within the nested program array before pagination; otherwise only the
    // first few large institutions are ever considered for every profile.
    url.searchParams.set('latest.programs.cip_4_digit.credential.level', '3');
    if (field && field !== 'other') {
      const [parameter, value] = FIELD_CIP_FILTER[field];
      url.searchParams.set(parameter, value);
    }
    const rows = await this.request(url);
    const universities = rows.flatMap((row) => {
      const university = mapScorecardUniversity(row, year);
      return university ? [university] : [];
    });
    return field ? universities.filter((university) => university.programs.some((program) => program.field === field)) : universities;
  }

  async getById(id: string): Promise<University | null> {
    const match = /^scorecard-(\d+)$/.exec(id);
    if (!match) throw new UniversityProviderError('INVALID_REQUEST');
    const url = this.createUrl();
    url.searchParams.set('id', match[1]!);
    url.searchParams.set('per_page', '1');
    const rows = await this.request(url);
    const university = rows.length ? mapScorecardUniversity(rows[0]) : null;
    return university?.id === id ? university : null;
  }

  private createUrl(year?: number): URL {
    const prefix = year === undefined ? 'latest' : String(year);
    const url = new URL(BASE_URL);
    url.searchParams.set('fields', FIELDS.map((field) => field.startsWith('school.') || field === 'id'
      ? field : `${prefix}.${field}`).concat('latest.programs.cip_4_digit').join(','));
    return url;
  }

  private async request(url: URL): Promise<unknown[]> {
    try {
      return await withTimeout(this.timeoutMs, async (signal) => {
        let response: Response;
        try {
          response = await this.fetcher(url, { headers: { 'X-Api-Key': this.apiKey }, signal });
        } catch {
          throw new UniversityProviderError(signal.aborted ? 'TIMEOUT' : 'UNAVAILABLE');
        }
        if (!response.ok) throw new UniversityProviderError('UNAVAILABLE');
        try {
          const body: unknown = await response.json();
          const parsed = scorecardResponseSchema.safeParse(body);
          if (!parsed.success) throw new UniversityProviderError('INVALID_RESPONSE');
          return parsed.data.results;
        } catch {
          throw new UniversityProviderError(signal.aborted ? 'TIMEOUT' : 'INVALID_RESPONSE');
        }
      });
    } catch (error) {
      if (error instanceof ExternalTimeoutError) throw new UniversityProviderError('TIMEOUT');
      throw error;
    }
  }
}
