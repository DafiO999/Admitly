import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../src/config/env.js';

describe('environment configuration', () => {
  it('provides local defaults without a database or external API keys', () => {
    expect(loadEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3001,
      DEMO_DATA_MODE: true,
    });
  });

  it('validates typed settings', () => {
    expect(loadEnvironment({ PORT: '3100', DEMO_DATA_MODE: 'false', COLLEGE_SCORECARD_API_KEY: 'private-key' })).toMatchObject({
      PORT: 3100,
      DEMO_DATA_MODE: false,
    });
    expect(() => loadEnvironment({ DEMO_DATA_MODE: 'false' })).toThrow('COLLEGE_SCORECARD_API_KEY');
    expect(() => loadEnvironment({ PORT: 'invalid' })).toThrow('PORT');
    expect(() => loadEnvironment({ DEMO_DATA_MODE: 'yes' })).toThrow('DEMO_DATA_MODE');
  });

  it('requires a PostgreSQL URL in production without exposing its value', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
    expect(() => loadEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'private-secret' }))
      .toThrow('DATABASE_URL');
  });
});
