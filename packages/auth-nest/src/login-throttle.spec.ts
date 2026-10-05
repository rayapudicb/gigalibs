import { randomBytes } from 'node:crypto';
import { HttpException, UnauthorizedException } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120e (U3.2, P1-20): login decisions around the per-account throttle. The SQL itself is proven against
// PostgreSQL in login-throttle.integration.test.ts.
const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  loginThrottle: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
  tenantMember: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
const passwordMock = vi.hoisted(() => ({ verifyPassword: vi.fn() }));

vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));
vi.mock('@gigalibs/auth-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@gigalibs/auth-core')>()),
  verifyPassword: passwordMock.verifyPassword,
}));

import { AuthService } from './auth.service.js';
import { loginThrottleKey } from './login-throttle.js';

const email = 'tester@example.test';
const activeUser = { id: 'user-1', email, status: 'ACTIVE', passwordHash: 'scrypt-v1$stored' };

/** Answers the two throttle statements: the lock lookup and the failure upsert. */
function throttleDatabase(state: { lockedUntil?: Date; nextFailure?: { failedCount: number; lockedUntil: Date | null } }) {
  prismaMock.$queryRaw.mockImplementation(async (strings: TemplateStringsArray) => {
    const sql = strings.join('?');
    if (sql.includes('SELECT "lockedUntil"')) return state.lockedUntil ? [{ lockedUntil: state.lockedUntil }] : [];
    if (sql.includes('INSERT INTO "login_throttles"')) return [state.nextFailure ?? { failedCount: 1, lockedUntil: null }];
    throw new Error(`Unexpected SQL: ${sql}`);
  });
}

describe('password login throttle', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.stubEnv('JWT_ACCESS_SECRET', 'x'.repeat(48));
    vi.stubEnv('JWT_ACCESS_EXPIRES_IN', '15m');
    vi.stubEnv('JWT_REFRESH_EXPIRES_IN', '30d');
    vi.stubEnv('CONTROL_PAYLOAD_KEY_VERSION', 'v1');
    vi.stubEnv('CONTROL_PAYLOAD_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
    prismaMock.auditLog.create.mockResolvedValue({});
    prismaMock.loginThrottle.deleteMany.mockResolvedValue({ count: 1 });
    service = new AuthService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('keys the throttle by a hash of the normalised email, never the email itself', () => {
    expect(loginThrottleKey('  Tester@Example.TEST ')).toBe(loginThrottleKey(email));
    expect(loginThrottleKey(email)).toMatch(/^[0-9a-f]{64}$/);
    expect(loginThrottleKey(email)).not.toContain('tester');
  });

  it('refuses a locked email with 429 before looking up the account or checking the password', async () => {
    const lockedUntil = new Date(Date.now() + 10 * 60_000);
    throttleDatabase({ lockedUntil });
    const error = await service.login({ email, password: 'right-password' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({
      code: 'LOGIN_LOCKED',
      retryAt: lockedUntil.toISOString(),
    });
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(passwordMock.verifyPassword).not.toHaveBeenCalled();
  });

  it('counts a wrong password and answers 401', async () => {
    throttleDatabase({ nextFailure: { failedCount: 2, lockedUntil: null } });
    prismaMock.user.findUnique.mockResolvedValue(activeUser);
    passwordMock.verifyPassword.mockResolvedValue(false);
    await expect(service.login({ email, password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.$queryRaw.mock.calls.some(([strings]) => strings.join('?').includes('INSERT INTO'))).toBe(true);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('treats an unknown email exactly like a wrong password: same answer, a full password check, and a count', async () => {
    throttleDatabase({});
    prismaMock.user.findUnique.mockResolvedValue(null);
    passwordMock.verifyPassword.mockResolvedValue(false);
    const error = await service.login({ email: 'nobody@example.test', password: 'guess' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe('Invalid email or password');
    expect(passwordMock.verifyPassword).toHaveBeenCalledTimes(1);
    expect(passwordMock.verifyPassword.mock.calls[0]?.[1]).toMatch(/^scrypt-v1\$/);
    expect(prismaMock.$queryRaw.mock.calls.some(([strings]) => strings.join('?').includes('INSERT INTO'))).toBe(true);
  });

  it('counts a disabled account like an unknown one', async () => {
    throttleDatabase({});
    prismaMock.user.findUnique.mockResolvedValue({ ...activeUser, status: 'SUSPENDED' });
    passwordMock.verifyPassword.mockResolvedValue(true);
    await expect(service.login({ email, password: 'right-password' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.$queryRaw.mock.calls.some(([strings]) => strings.join('?').includes('INSERT INTO'))).toBe(true);
  });

  it('audits the failure that locks a known account and still answers 401', async () => {
    const lockedUntil = new Date(Date.now() + 15 * 60_000);
    throttleDatabase({ nextFailure: { failedCount: 5, lockedUntil } });
    prismaMock.user.findUnique.mockResolvedValue(activeUser);
    passwordMock.verifyPassword.mockResolvedValue(false);
    await expect(service.login({ email, password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'LOGIN',
        resource: 'login_throttle',
        userId: 'user-1',
        metadata: { event: 'LOCKED', failedCount: 5, lockedUntil: lockedUntil.toISOString() },
      }),
    });
  });

  it('still answers 401 when the lock audit cannot be written', async () => {
    throttleDatabase({ nextFailure: { failedCount: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) } });
    prismaMock.user.findUnique.mockResolvedValue(activeUser);
    passwordMock.verifyPassword.mockResolvedValue(false);
    prismaMock.auditLog.create.mockRejectedValue(new Error('audit down'));
    await expect(service.login({ email, password: 'wrong' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('clears the count after a correct password and opens a session', async () => {
    throttleDatabase({});
    prismaMock.user.findUnique.mockResolvedValue(activeUser);
    passwordMock.verifyPassword.mockResolvedValue(true);
    const session = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };
    const create = vi
      .spyOn(AuthService.prototype as unknown as { createAuthSession: () => Promise<unknown> }, 'createAuthSession')
      .mockResolvedValue(session);
    prismaMock.tenantMember.findMany.mockResolvedValue([]);
    await expect(service.login({ email, password: 'right-password' })).resolves.toBe(session);
    expect(prismaMock.loginThrottle.deleteMany).toHaveBeenCalledWith({ where: { emailHash: loginThrottleKey(email) } });
    expect(create).toHaveBeenCalled();
    expect(prismaMock.$queryRaw.mock.calls.some(([strings]) => strings.join('?').includes('INSERT INTO'))).toBe(false);
  });
});
