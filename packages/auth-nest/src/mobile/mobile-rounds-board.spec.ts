import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MobileAuthService } from './mobile-auth.service.js';
import { MobileRoundsController } from './mobile-rounds.controller.js';

const subject = (permissions: string[]) => ({
  tenant: { id: 'tenant-a', entitlements: [{ moduleKey: 'operator-rounds', status: 'ENABLED' }] },
  permissions,
});
const codeOf = async (work: Promise<unknown>) => {
  try { await work; }
  catch (error) {
    return (error as {getResponse():{code:string}}).getResponse().code;
  }
  throw new Error('Expected mobile request to be refused.');
};

describe('mobile Rounds supervisor board access', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lets a board-only session reach board configuration, but refuses operator routes', async () => {
    vi.stubEnv('OPERATOR_ROUNDS_API_URL', '');
    const mobile = { moduleSubject: vi.fn(async () => subject(['operator-rounds.board.read'])) };
    const controller = new MobileRoundsController(mobile as unknown as MobileAuthService);
    expect(await codeOf(controller.board({}))).toBe('MOBILE_UNAVAILABLE');
    expect(await codeOf(controller.mine({}))).toBe('MOBILE_SCOPE_DENIED');
    expect(mobile.moduleSubject).toHaveBeenCalledTimes(2);
  });

  it('refuses an operator without board permission', async () => {
    const mobile = { moduleSubject: vi.fn(async () => subject(['operator-rounds.runs.execute'])) };
    const controller = new MobileRoundsController(mobile as unknown as MobileAuthService);
    expect(await codeOf(controller.board({}))).toBe('MOBILE_SCOPE_DENIED');
  });
});
