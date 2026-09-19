import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

const HEADER = 'x-admitly-access-key';

export class ProfileAccessDeniedError extends Error {
  constructor() {
    super('Profile access denied');
    this.name = 'ProfileAccessDeniedError';
  }
}

export function createProfileAccessToken(profileId: string, secret: string): string {
  return createHmac('sha256', secret).update(`admitly-profile-v1:${profileId}`).digest('base64url');
}

export function requireProfileAccess(request: FastifyRequest, profileId: string, secret: string): void {
  const supplied = request.headers[HEADER];
  const token = Array.isArray(supplied) ? supplied[0] : supplied;
  if (!token || token.length > 128) throw new ProfileAccessDeniedError();
  const expected = createProfileAccessToken(profileId, secret);
  const actualBytes = Buffer.from(token);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) {
    throw new ProfileAccessDeniedError();
  }
}
