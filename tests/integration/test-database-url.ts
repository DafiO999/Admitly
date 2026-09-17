export function getTestDatabaseUrl(environment: NodeJS.ProcessEnv): string | null {
  const raw = environment.TEST_DATABASE_URL;
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Unsafe TEST_DATABASE_URL');
  }

  const safe = environment.NODE_ENV !== 'production'
    && (url.protocol === 'postgresql:' || url.protocol === 'postgres:')
    && ['localhost', '127.0.0.1'].includes(url.hostname)
    && url.username === 'admitly'
    && url.pathname === '/admitly'
    && url.searchParams.getAll('schema').length === 1
    && url.searchParams.get('schema') === 'admitly_test'
    && [...url.searchParams.keys()].every((key) => key === 'schema')
    && url.hash === ''
    && raw !== environment.DATABASE_URL;

  if (!safe) throw new Error('Unsafe TEST_DATABASE_URL');
  return raw;
}
