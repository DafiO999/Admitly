import type { UniversityProvider } from '../application/ports/university-provider.js';
import type { Environment } from '../config/env.js';
import { CollegeScorecardProvider, type CollegeScorecardOptions } from './college-scorecard/university-provider.js';
import { DemoUniversityProvider } from './demo/university-provider.js';

export function createUniversityProvider(
  env: Pick<Environment, 'DEMO_DATA_MODE' | 'COLLEGE_SCORECARD_API_KEY'>,
  options: Omit<CollegeScorecardOptions, 'apiKey'> = {},
): UniversityProvider {
  return env.DEMO_DATA_MODE
    ? new DemoUniversityProvider()
    : new CollegeScorecardProvider({ apiKey: env.COLLEGE_SCORECARD_API_KEY ?? '', ...options });
}
