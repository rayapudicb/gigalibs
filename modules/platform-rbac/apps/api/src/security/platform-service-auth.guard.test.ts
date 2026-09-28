import type { ExecutionContext } from '@nestjs/common';
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlatformServiceAuthGuard } from './platform-service-auth.guard.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('PlatformServiceAuthGuard', () => {
  const guard = new PlatformServiceAuthGuard();

  it('keeps the health probe public', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(guard.canActivate(contextFor('/health'))).toBe(true);
  });

  it('fails closed in production when service authentication is not configured', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => guard.canActivate(contextFor('/api/tenant/v1/me'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('rejects an invalid service credential', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLATFORM_RBAC_SERVICE_TOKEN', 'correct-service-token-with-32-bytes-minimum');
    expect(() =>
      guard.canActivate(
        contextFor('/api/tenant/v1/me', '127.0.0.1', {
          'x-gigalibs-service-token': 'incorrect-service-token',
        }),
      ),
    ).toThrow(UnauthorizedException);
  });

  it('accepts the configured service credential', () => {
    const token = 'correct-service-token-with-32-bytes-minimum';
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('PLATFORM_RBAC_SERVICE_TOKEN', token);
    expect(
      guard.canActivate(
        contextFor('/api/tenant/v1/me', '10.0.0.8', {
          'x-gigalibs-service-token': token,
        }),
      ),
    ).toBe(true);
  });

  it('preserves only the non-production loopback compatibility path', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(guard.canActivate(contextFor('/api/tenant/v1/me', '127.0.0.1'))).toBe(true);
    expect(() => guard.canActivate(contextFor('/api/tenant/v1/me', '10.0.0.8'))).toThrow(
      ServiceUnavailableException,
    );
  });
});

function contextFor(
  path: string,
  remoteAddress = '127.0.0.1',
  headers: Readonly<Record<string, string>> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, headers, socket: { remoteAddress } }),
    }),
  } as unknown as ExecutionContext;
}
