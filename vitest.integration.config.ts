import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['dotenv/config'],
    // All integration files share the guarded admitly_test schema.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
