import { createPrivateKey, randomUUID } from 'node:crypto';
import { RequestBodyError, readBoundedBody } from '@/lib/authenticated-upstream';
import { type LocalModuleUpstream, localModuleUpstreamUrl } from '@/lib/local-module-upstream';
import { canUseTenantModule, hasPermission } from '@/lib/module-access';
import { mintPlatformContextToken } from '@/lib/platform-context';
import { hasSameOrigin } from '@/lib/same-origin';
import { type VerifiedSession, verifiedSession } from '@/lib/verified-session';
import { NextResponse } from 'next/server';

export type SignedModuleRouteContext = { params: Promise<{ path: string[] }> };

export interface SignedModuleProxyConfig {
  /** Catalogue module key carried in the minted entitlement claim. */
  readonly moduleKey: string;
  /** Exact audience the module service verifies. */
  readonly audience: string;
  readonly upstream: LocalModuleUpstream;
  readonly privateKeyEnvironmentKey: string;
  /** Prefix for problem codes, e.g. WORKFORCE. */
  readonly codePrefix: string;
  /** Short noun used in "Unsupported … route." */
  readonly routeNoun: string;
  /** Product name used in configuration and outage messages. */
  readonly serviceName: string;
  /** Entitlement name used in the access-denied message. */
  readonly entitlementName: string;
  /**
   * Allow-list: the permission a method and path require (a list means any one of them), or null when the route
   * is not exposed.
   */
  readonly requiredPermission: (method: string, path: readonly string[]) => string | readonly string[] | null;
  /**
   * The module's API prefix when it is not `v1` (WI-OI-104a: Connector Hub serves `api/connectors/v1`). The browser
   * path is appended to it, and `requiredPermission` sees the full path.
   */
  readonly upstreamPathPrefix?: readonly string[];
  /**
   * Optional server-side rewrite of a mutating request body before it is forwarded (for example evidence the BFF
   * composes from another module). It runs after authorization and receives the verified session.
   */
  readonly transformBody?: (session: VerifiedSession, method: string, path: readonly string[], body: string) => Promise<string>;
}

const MUTATING_METHODS = new Set(['POST', 'PATCH']);
const PATH_SEGMENT = /^[A-Za-z0-9._:-]{1,100}$/;

/**
 * Same-origin BFF proxy to a private module service. Authority is re-derived from the verified session
 * and forwarded only as a freshly minted PlatformContextV1; browser credentials and tenant headers are
 * never forwarded, and only allow-listed routes reach the module.
 */
export function createSignedModuleProxy(config: SignedModuleProxyConfig) {
  const problem = (status: number, code: string, title: string) =>
    NextResponse.json(
      { type: 'about:blank', title, status, code: `${config.codePrefix}_${code}`, correlationId: randomUUID() },
      { status, headers: { 'Content-Type': 'application/problem+json', 'Cache-Control': 'no-store' } },
    );

  return async function proxy(request: Request, context: SignedModuleRouteContext): Promise<NextResponse> {
    const session = await verifiedSession(true);
    if (session.response) return session.response;
    if (!session.context.tenant) {
      return problem(403, 'TENANT_REQUIRED', 'Select an active tenant workspace first.');
    }

    const method = request.method.toUpperCase();
    const rawPath = (await context.params).path;
    const path = config.upstreamPathPrefix
      ? [...config.upstreamPathPrefix, ...rawPath]
      : rawPath[0] === 'v1'
        ? rawPath
        : ['v1', ...rawPath];
    const requiredPermission = path.every((part) => PATH_SEGMENT.test(part))
      ? config.requiredPermission(method, path)
      : null;
    if (!requiredPermission) {
      return problem(404, 'ROUTE_UNSUPPORTED', `Unsupported ${config.routeNoun} route.`);
    }
    const acceptedPermissions: readonly string[] = typeof requiredPermission === 'string' ? [requiredPermission] : requiredPermission;

    if (
      !canUseTenantModule(config.moduleKey, new Set(session.context.tenant.features), session.context.permissions) ||
      !session.context.tenant.entitlements.some(
        (entitlement) => entitlement.moduleKey === config.moduleKey && entitlement.status === 'ENABLED',
      ) ||
      !acceptedPermissions.some((permission) => hasPermission(session.context.permissions, permission))
    ) {
      return problem(
        403,
        'ACCESS_DENIED',
        `An active ${config.entitlementName} entitlement and ${acceptedPermissions.join(' or ')} permission are required.`,
      );
    }
    if (MUTATING_METHODS.has(method) && !hasSameOrigin(request)) {
      return problem(403, 'CROSS_SITE_REJECTED', 'Cross-site request rejected.');
    }

    try {
      const target = localModuleUpstreamUrl(config.upstream, path);
      const received = MUTATING_METHODS.has(method) ? await readBoundedBody(request) : undefined;
      const body = received && config.transformBody ? await config.transformBody(session.context, method, path, received) : received;
      target.search = new URL(request.url).search;

      const moduleToken = mintPlatformContextToken(session.context, config.moduleKey, config.audience, {
        privateKey: signingKey(config),
      });
      const headers = new Headers({
        Accept: 'application/json, application/problem+json',
        Authorization: `Bearer ${moduleToken}`,
        'X-Correlation-Id': request.headers.get('x-correlation-id') ?? randomUUID(),
      });
      if (body) headers.set('Content-Type', 'application/json');

      const upstream = await fetch(target, {
        method,
        headers,
        ...(body ? { body } : {}),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(3_000),
      });
      const response = new NextResponse(upstream.body, { status: upstream.status });
      for (const name of ['content-type', 'content-disposition', 'etag', 'idempotency-replayed', 'x-correlation-id']) {
        const value = upstream.headers.get(name);
        if (value) response.headers.set(name, value);
      }
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      if (error instanceof RequestBodyError) {
        return problem(error.status, 'REQUEST_INVALID', error.message);
      }
      if (error instanceof Error && error.message.startsWith('Local module runtime')) {
        return problem(503, 'RUNTIME_NOT_CONFIGURED', `${config.serviceName} is not configured for this local runtime.`);
      }
      return problem(502, 'RUNTIME_UNAVAILABLE', `The ${config.serviceName} service is temporarily unavailable.`);
    }
  };
}

/**
 * Server-side call to a module as the verified session, for BFF routes that build the request body themselves
 * (for example from activated configuration). The same freshly minted PlatformContextV1 is the only authority.
 */
export async function callSignedModule(
  config: SignedModuleProxyConfig,
  session: VerifiedSession,
  method: 'GET' | 'POST',
  path: readonly string[],
  body?: unknown,
  timeoutMs = 3_000,
): Promise<Response> {
  const token = mintPlatformContextToken(session, config.moduleKey, config.audience, {
    privateKey: signingKey(config),
  });
  const target = localModuleUpstreamUrl(config.upstream, path);
  return fetch(target, {
    method,
    headers: {
      Accept: 'application/json, application/problem+json',
      Authorization: `Bearer ${token}`,
      'X-Correlation-Id': randomUUID(),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function signingKey(config: SignedModuleProxyConfig): string {
  const value = process.env[config.privateKeyEnvironmentKey]?.trim();
  if (!value) {
    throw new Error(`${config.privateKeyEnvironmentKey} is required.`);
  }
  try {
    const key = createPrivateKey({ key: Buffer.from(value, 'base64'), format: 'der', type: 'pkcs8' });
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key.export({ format: 'pem', type: 'pkcs8' }).toString();
  } catch {
    throw new Error(`The ${config.routeNoun} platform-context signing key is invalid.`);
  }
}
