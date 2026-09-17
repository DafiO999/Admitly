import { describe, expect, it } from 'vitest';
import { getTestDatabaseUrl } from '../integration/test-database-url.js';

const safeUrl = 'postgresql://admitly:local-example@localhost:5432/admitly?schema=admitly_test';

describe('test database URL guard', () => {
  it('accepts only an explicitly isolated local schema', () => {
    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: safeUrl })).toBe(safeUrl);
    expect(getTestDatabaseUrl({})).toBeNull();
  });

  it.each([
    { TEST_DATABASE_URL: safeUrl, DATABASE_URL: safeUrl },
    { TEST_DATABASE_URL: safeUrl.replace('admitly_test', 'public') },
    { TEST_DATABASE_URL: safeUrl.replace('localhost', 'remote.example') },
    { TEST_DATABASE_URL: safeUrl.replace('/admitly?', '/production?') },
    { TEST_DATABASE_URL: `${safeUrl}&schema=public` },
    { TEST_DATABASE_URL: `${safeUrl}&options=-csearch_path%3Dpublic` },
    { TEST_DATABASE_URL: safeUrl, NODE_ENV: 'production' },
  ])('rejects unsafe configuration', (environment) => {
    expect(() => getTestDatabaseUrl(environment)).toThrow('Unsafe TEST_DATABASE_URL');
  });
});
