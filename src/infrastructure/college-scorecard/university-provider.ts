import { z } from 'zod';
import {
  UniversityProviderError, type UniversityProvider, type UniversitySearchInput,
} from '../../application/ports/university-provider.js';
import type { University } from '../../domain/university/schema.js';
import { mapScorecardUniversity, scorecardResponseSchema } from './mapper.js';

const BASE_URL = 'https://api.data.gov/ed/collegescorecard/v1/schools';
const FIELDS = [
  'id', 'school.name', 'school.city', 'school.state', 'school.school_url',
  'student.size', 'admissions.admission_rate.overall',
  'cost.tuition.out_of_state', 'cost.avg_net_price.overall',
];

const searchSchema = z.object({
  state: z.string().regex(/^[A-Z]{2}$/).optional(),
  field: z.enum(['computer_science', 'engineering', 'business', 'economics', 'design', 'other']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
}).strict();

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
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetcher = options.fetcher ?? fetch;
  }

  async search(input: UniversitySearchInput): Promise<University[]> {
    const parsed = searchSchema.safeParse(input);
    if (!parsed.success) throw new UniversityProviderError('INVALID_REQUEST');
    const { state, field, limit = 20, year } = parsed.data;
    const url = this.createUrl(year);
    url.searchParams.set('per_page', String(limit));
    if (state) url.searchParams.set('school.state', state);
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
    const signal = AbortSignal.timeout(this.timeoutMs);
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
  }
}
