import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().trim().optional(),
);

const optionalDatabaseUrl = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.url().refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
    message: 'DATABASE_URL must be a PostgreSQL URL',
  }).optional(),
);

const optionalSmtpText = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().trim().min(1).optional(),
);
const optionalSmtpEmail = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.email().max(254).optional(),
);

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DEMO_DATA_MODE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  DATABASE_URL: optionalDatabaseUrl,
  TEST_DATABASE_URL: optionalDatabaseUrl,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
  GEMINI_LETTER_MODEL: optionalString,
  COLLEGE_SCORECARD_API_KEY: optionalString,
  PROFILE_ACCESS_SECRET: optionalString,
  MAIL_DELIVERY_MODE: z.enum(['mock', 'smtp']).default('mock'),
  SMTP_HOST: optionalSmtpText,
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  SMTP_USER: optionalSmtpText,
  SMTP_PASSWORD: optionalSmtpText,
  SMTP_FROM_EMAIL: optionalSmtpEmail,
  SMTP_FROM_NAME: z.string().trim().min(1).max(120).default('Admitly'),
  LETTER_UPLOAD_DIR: optionalString,
  LETTER_ATTACHMENT_MAX_FILE_BYTES: z.coerce.number().int().min(1).max(100 * 1024 * 1024).default(10 * 1024 * 1024),
  LETTER_ATTACHMENT_MAX_TOTAL_BYTES: z.coerce.number().int().min(1).max(500 * 1024 * 1024).default(20 * 1024 * 1024),
}).superRefine((value, context) => {
  const smtpFields = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM_EMAIL'] as const;
  if (value.MAIL_DELIVERY_MODE === 'smtp') {
    for (const field of smtpFields) {
      if (!value[field]) context.addIssue({ code: 'custom', path: [field], message: 'SMTP setting is required' });
    }
  }
  if (value.SMTP_PORT === 465 && !value.SMTP_SECURE) {
    context.addIssue({ code: 'custom', path: ['SMTP_SECURE'], message: 'Port 465 requires TLS' });
  }
  if (value.LETTER_ATTACHMENT_MAX_TOTAL_BYTES < value.LETTER_ATTACHMENT_MAX_FILE_BYTES) {
    context.addIssue({ code: 'custom', path: ['LETTER_ATTACHMENT_MAX_TOTAL_BYTES'],
      message: 'Total attachment limit must be at least the per-file limit' });
  }
  if (value.NODE_ENV === 'production' && value.LETTER_UPLOAD_DIR
    && value.LETTER_UPLOAD_DIR !== '/data/uploads') {
    context.addIssue({ code: 'custom', path: ['LETTER_UPLOAD_DIR'],
      message: 'Production attachments must use the mounted /data/uploads directory' });
  }
  if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
    context.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: 'DATABASE_URL is required in production',
    });
  }
  if (!value.DEMO_DATA_MODE && !value.COLLEGE_SCORECARD_API_KEY) {
    context.addIssue({
      code: 'custom',
      path: ['COLLEGE_SCORECARD_API_KEY'],
      message: 'COLLEGE_SCORECARD_API_KEY is required when DEMO_DATA_MODE=false',
    });
  }
  if (value.NODE_ENV === 'production' && (!value.PROFILE_ACCESS_SECRET || value.PROFILE_ACCESS_SECRET.length < 32)) {
    context.addIssue({
      code: 'custom', path: ['PROFILE_ACCESS_SECRET'],
      message: 'PROFILE_ACCESS_SECRET with at least 32 characters is required in production',
    });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export class ConfigurationError extends Error {
  constructor(fields: string[]) {
    super(`Invalid environment configuration: ${fields.join(', ')}`);
    this.name = 'ConfigurationError';
  }
}

export function loadEnvironment(values: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(values);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))];
    throw new ConfigurationError(fields);
  }
  return result.data;
}

export function profileAccessSecret(environment: Pick<Environment, 'NODE_ENV' | 'PROFILE_ACCESS_SECRET'>): string {
  return environment.PROFILE_ACCESS_SECRET ?? 'admitly-local-profile-access-secret';
}
