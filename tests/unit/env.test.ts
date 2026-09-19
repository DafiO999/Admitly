import { describe, expect, it } from 'vitest';
import { loadEnvironment } from '../../src/config/env.js';

describe('environment configuration', () => {
  it('provides local defaults without a database or external API keys', () => {
    expect(loadEnvironment({})).toMatchObject({
      NODE_ENV: 'development',
      HOST: '127.0.0.1',
      PORT: 3001,
      DEMO_DATA_MODE: true,
      MAIL_DELIVERY_MODE: 'mock',
      LETTER_ATTACHMENT_MAX_FILE_BYTES: 10485760,
      LETTER_ATTACHMENT_MAX_TOTAL_BYTES: 20971520,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
      SMTP_FROM_NAME: 'Admitly',
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
    expect(() => loadEnvironment({ LETTER_ATTACHMENT_MAX_FILE_BYTES: '0' })).toThrow('LETTER_ATTACHMENT_MAX_FILE_BYTES');
    expect(() => loadEnvironment({ LETTER_ATTACHMENT_MAX_FILE_BYTES: '30', LETTER_ATTACHMENT_MAX_TOTAL_BYTES: '20' }))
      .toThrow('LETTER_ATTACHMENT_MAX_TOTAL_BYTES');
    expect(() => loadEnvironment({ MAIL_DELIVERY_MODE: 'smtp', SMTP_HOST: 'smtp.example.test' })).toThrow('SMTP_USER');
    expect(() => loadEnvironment({ MAIL_DELIVERY_MODE: 'invalid' })).toThrow('MAIL_DELIVERY_MODE');
    expect(() => loadEnvironment({ SMTP_PORT: '465' })).toThrow('SMTP_SECURE');
    expect(() => loadEnvironment({ SMTP_FROM_EMAIL: 'bad-address' })).toThrow('SMTP_FROM_EMAIL');
    expect(loadEnvironment({ MAIL_DELIVERY_MODE: 'smtp', SMTP_HOST: 'smtp.example.test', SMTP_USER: 'user', SMTP_PASSWORD: 'secret',
      SMTP_FROM_EMAIL: 'letters@example.test' })).toMatchObject({ SMTP_HOST: 'smtp.example.test' });
  });

  it('requires a PostgreSQL URL in production without exposing its value', () => {
    expect(() => loadEnvironment({ NODE_ENV: 'production' })).toThrow('DATABASE_URL');
    expect(() => loadEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'private-secret' }))
      .toThrow('DATABASE_URL');
    expect(() => loadEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/admitly',
      LETTER_UPLOAD_DIR: 'relative/uploads' })).toThrow('LETTER_UPLOAD_DIR');
    expect(loadEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/admitly',
      PROFILE_ACCESS_SECRET: 'a-secure-profile-access-secret-value' }))
      .toMatchObject({ MAIL_DELIVERY_MODE: 'mock' });
    expect(() => loadEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/admitly',
      PROFILE_ACCESS_SECRET: 'a-secure-profile-access-secret-value', MAIL_DELIVERY_MODE: 'smtp' })).toThrow('SMTP_HOST');
  });
});
