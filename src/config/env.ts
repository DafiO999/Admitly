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

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DEMO_DATA_MODE: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  DATABASE_URL: optionalDatabaseUrl,
  TEST_DATABASE_URL: optionalDatabaseUrl,
  GEMINI_API_KEY: optionalString,
  GEMINI_MODEL: optionalString,
  COLLEGE_SCORECARD_API_KEY: optionalString,
}).superRefine((value, context) => {
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
