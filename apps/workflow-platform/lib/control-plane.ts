export { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from './auth-constants';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
  requiresMfa?: boolean;
  mfaEnrolled?: boolean;
}

type UpstreamPlane = 'control' | 'execution';

export class UpstreamUnavailableError extends Error {
  constructor(plane: UpstreamPlane) {
    super(`${plane === 'control' ? 'Control' : 'Execution'} plane is synchronizing.`);
  }
}

export function controlPlaneUrl(path: string): string {
  return upstreamUrl('CONTROL_PLANE_API_URL', path);
}

export function executionPlaneUrl(path: string): string {
  return upstreamUrl('EXECUTION_PLANE_API_URL', path);
}

function upstreamUrl(
  environmentVariable: 'CONTROL_PLANE_API_URL' | 'EXECUTION_PLANE_API_URL',
  path: string,
): string {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('Upstream paths must be absolute application paths.');
  }
  const configuredUrl = process.env[environmentVariable]?.trim();
  if (!configuredUrl) {
    throw new Error(`${environmentVariable} is not configured`);
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(configuredUrl);
  } catch {
    throw new Error(`${environmentVariable} must be an absolute URL`);
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) {
    throw new Error(`${environmentVariable} must use HTTP or HTTPS`);
  }
  return new URL(path, baseUrl.origin).toString();
}

export function isTokenResponse(value: unknown): value is TokenResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<TokenResponse>;
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0 &&
    typeof candidate.expiresIn === 'number' &&
    Number.isSafeInteger(candidate.expiresIn) &&
    (candidate.expiresIn ?? 0) > 0 &&
    candidate.tokenType === 'Bearer' &&
    (candidate.requiresMfa === undefined || typeof candidate.requiresMfa === 'boolean') &&
    (candidate.mfaEnrolled === undefined || typeof candidate.mfaEnrolled === 'boolean')
  );
}

export function accessCookieOptions(expiresIn: number) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    maxAge: expiresIn,
    path: '/',
  };
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
  };
}

export function tokenHasTenant(accessToken: string): boolean {
  try {
    const payloadSegment = accessToken.split('.')[1];
    if (!payloadSegment) return false;
    const payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as {
      tid?: unknown;
    };
    return typeof payload.tid === 'string' && payload.tid.length > 0;
  } catch {
    return false;
  }
}

export async function upstreamError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown; detail?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.detail === 'string') return payload.detail;
  } catch {
    // The upstream may intentionally return an empty error body.
  }
  return 'The authentication service rejected the request.';
}
