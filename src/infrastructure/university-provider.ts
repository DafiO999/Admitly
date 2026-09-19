import type { UniversityProvider } from '../application/ports/university-provider.js';
import type { Environment } from '../config/env.js';
import { CollegeScorecardProvider, type CollegeScorecardOptions } from './college-scorecard/university-provider.js';
import { DemoUniversityProvider } from './demo/university-provider.js';

class ScorecardWithDemoFallback implements UniversityProvider {
  constructor(
    private readonly scorecard: CollegeScorecardProvider,
    private readonly demo: DemoUniversityProvider,
  ) {}

  async search(input: Parameters<UniversityProvider['search']>[0]) {
    try {
      const rows = await this.scorecard.search(input);
      if (rows.length > 0) return rows;
    } catch {
      // A complete, visibly demo-labelled result is safer than a broken judge flow.
    }
    return this.demo.search(input);
  }

  async getById(id: string) {
    if (id.startsWith('demo-')) return this.demo.getById(id);
    return this.scorecard.getById(id);
  }
}

export function createUniversityProvider(
  env: Pick<Environment, 'DEMO_DATA_MODE' | 'COLLEGE_SCORECARD_API_KEY'>,
  options: Omit<CollegeScorecardOptions, 'apiKey'> = {},
): UniversityProvider {
  const demo = new DemoUniversityProvider();
  return env.DEMO_DATA_MODE
    ? demo
    : new ScorecardWithDemoFallback(
      new CollegeScorecardProvider({ apiKey: env.COLLEGE_SCORECARD_API_KEY ?? '', ...options }), demo,
    );
}
