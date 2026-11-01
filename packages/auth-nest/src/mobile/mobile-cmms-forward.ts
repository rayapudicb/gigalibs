import { createPrivateKey, randomUUID } from 'node:crypto';
import { buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import { holdsPermission, type MobileProblemCode } from '@gigalibs/contracts';
import { HttpException, type Logger } from '@nestjs/common';
import { type MobileAuthService, MobileProblemException, type MobileRequest } from './mobile-auth.service.js';

// WI-OI-134/135: the mobile CMMS journeys (calibration, commissioning) call CMMS the same way. The mobile bearer is checked
// against the current control-plane session; CMMS (`asset-maintenance`) must be enabled and the member must hold the
// route's permission; the call carries a 60-second context signed for CMMS only, and CMMS re-checks everything.

export const MOBILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CMMS_MODULE_KEY = 'asset-maintenance';
const CMMS_AUDIENCE = 'gigalibs-cmms-api';

export type RequestHeaders = Record<string, string | string[] | undefined>;
const single = (headers: RequestHeaders, name: string) =>
  typeof headers[name] === 'string' ? (headers[name] as string) : undefined;

export function mobileRequestFrom(headers: RequestHeaders): MobileRequest {
  const authorization = single(headers, 'authorization');
  const installationId = single(headers, 'x-gigalibs-installation-id');
  const appVersion = single(headers, 'x-gigalibs-app-version');
  return {
    ...(authorization ? { authorization } : {}),
    ...(installationId ? { installationId } : {}),
    ...(appVersion ? { appVersion } : {}),
  };
}

export async function forwardMobileCmms(options: {
  readonly mobile: MobileAuthService;
  readonly headers: RequestHeaders;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly permission: string;
  readonly conflict: MobileProblemCode;
  readonly logger: Logger;
  readonly body?: unknown;
}): Promise<unknown> {
  const subject = await options.mobile.moduleSubject(mobileRequestFrom(options.headers));
  if (!subject.tenant || !subject.tenant.entitlements.some((item) =>
    item.moduleKey === CMMS_MODULE_KEY && item.status === 'ENABLED') || !holdsPermission(subject.permissions, options.permission))
    throw new MobileProblemException('MOBILE_SCOPE_DENIED');
  const upstream = process.env['CMMS_API_URL']?.trim();
  const encodedKey = process.env['CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64']?.trim();
  if (!upstream || !encodedKey) throw new MobileProblemException('MOBILE_UNAVAILABLE');
  let url: URL;
  let privateKey: string;
  try {
    url = new URL(upstream);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('invalid upstream');
    privateKey = createPrivateKey({ key: Buffer.from(encodedKey, 'base64'), format: 'der', type: 'pkcs8' })
      .export({ format: 'pem', type: 'pkcs8' })
      .toString();
  } catch {
    throw new MobileProblemException('MOBILE_UNAVAILABLE');
  }
  const token = signPlatformContextToken(
    buildPlatformContext(subject, CMMS_MODULE_KEY, CMMS_AUDIENCE, { ttlSeconds: 60 }),
    privateKey,
  );
  const target = new URL(`${url.pathname.replace(/\/$/, '')}${options.path}`, url.origin);
  let response: Response;
  try {
    response = await fetch(target, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, application/problem+json',
        'X-Correlation-Id': single(options.headers, 'x-correlation-id') ?? randomUUID(),
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new MobileProblemException(error instanceof Error && error.name === 'TimeoutError'
      ? 'MOBILE_UPSTREAM_TIMEOUT' : 'MOBILE_UNAVAILABLE');
  }
  const value: unknown = await response.json().catch(() => null);
  if (response.ok && value && typeof value === 'object') return value;
  if (response.status === 409) throw new MobileProblemException(options.conflict);
  if (response.status === 400 || response.status === 422) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  if (response.status === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
  if (response.status === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
  if (response.status === 404) throw new MobileProblemException('MOBILE_NOT_FOUND');
  options.logger.warn(`CMMS returned status ${response.status} to a mobile call.`);
  throw new MobileProblemException('MOBILE_UNAVAILABLE');
}

/** Maps anything that is not already a mobile problem to one, without echoing internal detail. */
export async function answerMobile<T>(logger: Logger, label: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof MobileProblemException) throw error;
    if (error instanceof HttpException && error.getStatus() === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
    if (error instanceof HttpException && error.getStatus() === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
    logger.error(`${label} failed: ${error instanceof Error ? error.name : 'UnknownError'}`);
    throw new MobileProblemException('MOBILE_UNAVAILABLE');
  }
}
