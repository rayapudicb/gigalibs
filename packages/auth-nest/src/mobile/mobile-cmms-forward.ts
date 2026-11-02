import { createPrivateKey, randomUUID } from 'node:crypto';
import { type PlatformContextSubject, buildPlatformContext, signPlatformContextToken } from '@gigalibs/auth-core';
import { holdsPermission, type MobileProblemCode } from '@gigalibs/contracts';
import { HttpException, type Logger } from '@nestjs/common';
import { type MobileAuthService, MobileProblemException, type MobileRequest } from './mobile-auth.service.js';

// WI-OI-134/135/137: the mobile module journeys (calibration, commissioning, spares, logbook) call their module the same way. The mobile bearer is checked
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

interface MobileForwardOptions {
  readonly mobile: MobileAuthService;
  readonly headers: RequestHeaders;
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly permission: string;
  readonly conflict: MobileProblemCode;
  readonly logger: Logger;
  readonly body?: unknown;
}

/** A module the mobile adapters call: its entitlement key, signed-context audience and environment names. */
export interface MobileModuleTarget {
  readonly moduleKey: string;
  readonly audience: string;
  readonly urlEnvironment: string;
  readonly keyEnvironment: string;
}

export const CMMS_TARGET: MobileModuleTarget = {
  moduleKey: CMMS_MODULE_KEY, audience: CMMS_AUDIENCE, urlEnvironment: 'CMMS_API_URL',
  keyEnvironment: 'CMMS_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
};
/** WI-OI-137: Workforce (`gigaops`) for the mobile shift logbook. */
export const WORKFORCE_TARGET: MobileModuleTarget = {
  moduleKey: 'gigaops', audience: 'gigalibs-workforce-api', urlEnvironment: 'WORKFORCE_API_URL',
  keyEnvironment: 'WORKFORCE_PLATFORM_CONTEXT_PRIVATE_KEY_BASE64',
};

export function forwardMobileCmms(options: MobileForwardOptions): Promise<unknown> {
  return forwardMobileModule(CMMS_TARGET, options);
}

/** Why a module call could not be made or answered: the module is not configured or reachable, or it timed out. */
export class ModuleCallUnavailable extends Error {
  constructor(readonly reason: 'unavailable' | 'timeout') {
    super(`Module call ${reason}.`);
  }
}

/**
 * Calls a module as `subject` with a 60-second context signed for that module only (WI-OI-140: also the portal
 * principal). The caller has already decided the subject may make this call; the module re-checks everything.
 */
export async function callModule(
  target: MobileModuleTarget,
  subject: PlatformContextSubject,
  call: { readonly method: 'GET' | 'POST'; readonly path: string; readonly body?: unknown; readonly correlationId?: string },
): Promise<{ readonly status: number; readonly value: unknown }> {
  const upstream = process.env[target.urlEnvironment]?.trim();
  const encodedKey = process.env[target.keyEnvironment]?.trim();
  if (!upstream || !encodedKey) throw new ModuleCallUnavailable('unavailable');
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
    throw new ModuleCallUnavailable('unavailable');
  }
  const token = signPlatformContextToken(
    buildPlatformContext(subject, target.moduleKey, target.audience, { ttlSeconds: 60 }),
    privateKey,
  );
  const requestUrl = new URL(`${url.pathname.replace(/\/$/, '')}${call.path}`, url.origin);
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: call.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json, application/problem+json',
        'X-Correlation-Id': call.correlationId ?? randomUUID(),
        ...(call.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(call.body === undefined ? {} : { body: JSON.stringify(call.body) }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new ModuleCallUnavailable(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unavailable');
  }
  return { status: response.status, value: await response.json().catch(() => null) };
}

export async function forwardMobileModule(target: MobileModuleTarget, options: MobileForwardOptions): Promise<unknown> {
  const subject = await options.mobile.moduleSubject(mobileRequestFrom(options.headers));
  if (!subject.tenant || !subject.tenant.entitlements.some((item) =>
    item.moduleKey === target.moduleKey && item.status === 'ENABLED') || !holdsPermission(subject.permissions, options.permission))
    throw new MobileProblemException('MOBILE_SCOPE_DENIED');
  let answer: { readonly status: number; readonly value: unknown };
  try {
    const correlationId = single(options.headers, 'x-correlation-id');
    answer = await callModule(target, subject, {
      method: options.method, path: options.path,
      ...(options.body === undefined ? {} : { body: options.body }),
      ...(correlationId ? { correlationId } : {}),
    });
  } catch (error) {
    if (error instanceof ModuleCallUnavailable)
      throw new MobileProblemException(error.reason === 'timeout' ? 'MOBILE_UPSTREAM_TIMEOUT' : 'MOBILE_UNAVAILABLE');
    throw error;
  }
  const { status, value } = answer;
  if (status >= 200 && status < 300 && value && typeof value === 'object') return value;
  if (status === 409) throw new MobileProblemException(options.conflict);
  if (status === 400 || status === 422) throw new MobileProblemException('MOBILE_REQUEST_INVALID');
  if (status === 401) throw new MobileProblemException('MOBILE_AUTH_REQUIRED');
  if (status === 403) throw new MobileProblemException('MOBILE_SCOPE_DENIED');
  if (status === 404) throw new MobileProblemException('MOBILE_NOT_FOUND');
  options.logger.warn(`${target.moduleKey} returned status ${status} to a mobile call.`);
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
