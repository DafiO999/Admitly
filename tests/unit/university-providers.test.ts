import { describe, expect, it, vi } from 'vitest';
import { UniversityProviderError } from '../../src/application/ports/university-provider.js';
import { mapScorecardUniversity } from '../../src/infrastructure/college-scorecard/mapper.js';
import { CollegeScorecardProvider } from '../../src/infrastructure/college-scorecard/university-provider.js';
import { DemoUniversityProvider } from '../../src/infrastructure/demo/university-provider.js';
import { createUniversityProvider } from '../../src/infrastructure/university-provider.js';

const scorecardRow = {
  id: 166027,
  'school.name': 'Example University',
  'school.city': 'Cambridge',
  'school.state': 'MA',
  'school.school_url': 'www.example.edu',
  '2023.student.size': 8000,
  '2023.admissions.admission_rate.overall': 0.3,
  '2023.admissions.sat_scores.average.overall': 1553,
  '2023.cost.tuition.out_of_state': null,
  'latest.programs.cip_4_digit': [
    { code: '1107', title: 'Computer Science.', credential: { level: 3 } },
    { code: '1401', title: 'Engineering, General.', credential: { level: 5 } },
  ],
};

function response(results: unknown[], status = 200): Response {
  return new Response(JSON.stringify({ metadata: { total: results.length }, results }), { status });
}

describe('university providers', () => {
  it('selects fixture-backed demo mode without a key or network', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const provider = createUniversityProvider(
      { DEMO_DATA_MODE: true, COLLEGE_SCORECARD_API_KEY: undefined }, { fetcher },
    );
    expect(provider).toBeInstanceOf(DemoUniversityProvider);
    const universities = await provider.search({ state: 'CA', field: 'computer_science' });
    expect(universities).toHaveLength(1);
    expect(universities[0]?.sourceStatus).toBe('demo');
    expect(await provider.getById(universities[0]!.id)).toEqual(universities[0]);
    expect(await provider.getById('missing')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('maps Scorecard data to normalized universities and omits missing fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([scorecardRow]));
    const provider = createUniversityProvider(
      { DEMO_DATA_MODE: false, COLLEGE_SCORECARD_API_KEY: 'private-key' }, { fetcher },
    );
    const universities = await provider.search({ state: 'MA', field: 'computer_science', year: 2023, limit: 5 });

    expect(universities).toEqual([{
      id: 'scorecard-166027', provider: 'college_scorecard', name: 'Example University',
      city: 'Cambridge', state: 'MA', websiteUrl: 'https://www.example.edu/',
      studentSize: 8000, admissionRate: 0.3,
      programs: [{
        key: '1107', name: 'Computer Science.', field: 'computer_science', degree: 'bachelor',
        sourceStatus: 'official', sourceUrl: 'https://api.data.gov/ed/collegescorecard/v1/schools?id=166027',
      }],
      dataYear: 2023, sourceStatus: 'official',
      sourceUrl: 'https://api.data.gov/ed/collegescorecard/v1/schools?id=166027',
    }]);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toContain('school.state=MA');
    expect(String(url)).toContain('2023.student.size');
    expect(String(url)).toContain('latest.programs.cip_4_digit');
    expect(String(url)).not.toContain('private-key');
    expect(init?.headers).toEqual({ 'X-Api-Key': 'private-key' });
    expect(JSON.stringify(universities)).not.toContain('private-key');
    expect(universities[0]).not.toHaveProperty('satMedian');
  });

  it('does not invent a single data year for latest fields', () => {
    const university = mapScorecardUniversity({
      id: 12, 'school.name': 'Sparse College',
      'latest.programs.cip_4_digit': [
        { code: '4506', title: 'Economics.', credential: { level: 3 } },
      ],
      'latest.student.size': null,
    });
    expect(university).toMatchObject({
      id: 'scorecard-12', programs: [{ field: 'economics' }], sourceStatus: 'official',
    });
    expect(university).not.toHaveProperty('dataYear');
    expect(university).not.toHaveProperty('studentSize');
    expect(mapScorecardUniversity({ id: 13, 'school.name': 'No bachelor programs' })).toBeNull();
  });

  it('looks up Scorecard IDs and returns null for missing records', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    const provider = new CollegeScorecardProvider({ apiKey: 'private-key', fetcher });
    expect(await provider.getById('scorecard-166027')).toBeNull();
    expect(String(fetcher.mock.calls[0]?.[0])).toContain('id=166027');
    await expect(provider.getById('demo-redwood-state')).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });

  it('returns typed, secret-free errors for configuration, HTTP, response, and timeout failures', async () => {
    expect(() => new CollegeScorecardProvider({ apiKey: '' })).toThrow(UniversityProviderError);
    const unavailable = new CollegeScorecardProvider({
      apiKey: 'private-key', fetcher: vi.fn<typeof fetch>().mockResolvedValue(response([], 503)),
    });
    await expect(unavailable.search({})).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    const malformed = new CollegeScorecardProvider({
      apiKey: 'private-key', fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response('{}')),
    });
    await expect(malformed.search({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    const timedOut = new CollegeScorecardProvider({
      apiKey: 'private-key', timeoutMs: 1,
      fetcher: (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('private-key')));
      }),
    });
    await expect(timedOut.search({})).rejects.toMatchObject({ code: 'TIMEOUT' });
    await expect(timedOut.search({})).rejects.toThrow('University provider timeout');
  });
});
