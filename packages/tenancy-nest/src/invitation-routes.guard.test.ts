import { ALLOW_MFA_PENDING_KEY, IS_PUBLIC_KEY, JwtAuthGuard } from '@gigalibs/auth-nest';
import { type ExecutionContext, RequestMethod, UnauthorizedException } from '@nestjs/common';
import {
  HEADERS_METADATA,
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';

// WI-OI-120ba (Security review of release 70c19af, Low 1): the invitation routes must stay signed-in only. A later
// `@Public()` or `@AllowMfaPending()` on a handler or the controller, or a lost `no-store`, fails here.
vi.mock('@gigalibs/db', () => ({ prisma: {} }));

const { TenancyController } = await import('./tenancy.controller.js');

// As Nest's Reflector.getAllAndOverride: the handler's value wins, then the controller's.
const reflector = {
  getAllAndOverride: (key: string, targets: object[]) =>
    targets.map((target) => Reflect.getMetadata(key, target)).find((value) => value !== undefined),
};
const routes = [
  ['previewInvite', 'invitations/preview'],
  ['acceptInvite', 'invitations/accept'],
] as const;
const handler = (name: (typeof routes)[number][0]) => TenancyController.prototype[name];

describe('invitation routes', () => {
  it.each(routes)(
    '%s is a signed-in POST %s, never public or open while MFA is pending',
    (name, path) => {
      const targets = [handler(name), TenancyController];
      expect(Reflect.getMetadata(PATH_METADATA, handler(name))).toBe(path);
      expect(Reflect.getMetadata(METHOD_METADATA, handler(name))).toBe(RequestMethod.POST);
      expect(reflector.getAllAndOverride(IS_PUBLIC_KEY, targets)).toBeFalsy();
      expect(reflector.getAllAndOverride(ALLOW_MFA_PENDING_KEY, targets)).toBeFalsy();
      // The person accepting is not yet in the workspace, so the workspace boundary is skipped, never the sign-in.
      expect(Reflect.getMetadata('skipTenantBoundary', handler(name))).toBe(true);
      expect(Reflect.getMetadata(HEADERS_METADATA, handler(name))).toEqual(
        expect.arrayContaining([{ name: 'Cache-Control', value: 'no-store' }]),
      );
    },
  );

  it('answers the preview with 200, as a read', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler('previewInvite'))).toBe(200);
  });

  it.each(routes)('the sign-in guard refuses %s without a session', async (name) => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'test-only-secret-for-the-guard-check-0123456789');
    const guard = new JwtAuthGuard(reflector as never);
    const context = {
      getHandler: () => handler(name),
      getClass: () => TenancyController,
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    vi.unstubAllEnvs();
  });
});
