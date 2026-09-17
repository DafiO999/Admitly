import { gpaScaleSchema, type GpaScale } from './schema.js';

export function normalizeGpa(value: number, scale: GpaScale): number {
  if (!gpaScaleSchema.safeParse(scale).success || !Number.isFinite(value) || value < 0 || value > scale) {
    throw new RangeError('Invalid GPA');
  }
  return Math.round((value / scale) * 400) / 100;
}
