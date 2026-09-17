import { z } from 'zod';

export const sourceStatusSchema = z.enum(['official', 'verified', 'demo', 'unknown']);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export function validateSource(
  value: { sourceStatus: SourceStatus; sourceUrl?: string | undefined },
  context: z.RefinementCtx,
): void {
  if ((value.sourceStatus === 'official' || value.sourceStatus === 'verified') && !value.sourceUrl) {
    context.addIssue({
      code: 'custom',
      path: ['sourceUrl'],
      message: 'An official or verified source requires a URL',
    });
  }
}
