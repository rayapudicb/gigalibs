import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// WI-OI-120bd: sessions past their expiry are marked EXPIRED in bounded batches, with one audit summary.
const prismaMock = vi.hoisted(() => ({
  session: { findMany: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
}));
vi.mock('@gigalibs/db', () => ({ prisma: prismaMock }));

const { SessionSweepWorker, sessionSweepPolicy } = await import('./session-sweep.worker.js');

const NOW = new Date('2026-10-16T10:00:00Z');
const ids = (count: number, from = 0) =>
  Array.from({ length: count }, (_, index) => ({ id: `s${from + index}` }));

describe('expired-session sweep', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.session.updateMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) => ({
        count: where.id.in.length,
      }),
    );
  });
  afterEach(() => vi.unstubAllEnvs());

  it('marks only ACTIVE sessions already past expiry as EXPIRED, checking both again as it writes', async () => {
    prismaMock.session.findMany.mockResolvedValueOnce(ids(3)).mockResolvedValue([]);
    await expect(new SessionSweepWorker().tick(NOW)).resolves.toBe(3);
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE', expiresAt: { lt: NOW } }, take: 500 }),
    );
    expect(prismaMock.session.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['s0', 's1', 's2'] }, status: 'ACTIVE', expiresAt: { lt: NOW } },
      data: { status: 'EXPIRED' },
    });
  });

  it('writes one audit summary when it changed something, and none when nothing was due', async () => {
    prismaMock.session.findMany.mockResolvedValueOnce(ids(2)).mockResolvedValue([]);
    await new SessionSweepWorker().tick(NOW);
    expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.auditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'STATUS_CHANGE',
        resource: 'session',
        metadata: { event: 'EXPIRED_SESSIONS_SWEPT', count: 2, expiredBefore: NOW.toISOString() },
      },
    });
    vi.clearAllMocks();
    prismaMock.session.findMany.mockResolvedValue([]);
    await expect(new SessionSweepWorker().tick(NOW)).resolves.toBe(0);
    expect(prismaMock.auditLog.create).not.toHaveBeenCalled();
  });

  it('works in bounded batches and stops at the per-run limit', async () => {
    vi.stubEnv('SESSION_SWEEP_BATCH_SIZE', '2');
    vi.stubEnv('SESSION_SWEEP_MAX_BATCHES', '3');
    prismaMock.session.findMany.mockImplementation(async () => ids(2));
    await expect(new SessionSweepWorker().tick(NOW)).resolves.toBe(6);
    expect(prismaMock.session.findMany).toHaveBeenCalledTimes(3);
    expect(prismaMock.session.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('takes its interval and batch size from configuration, and refuses nonsense', () => {
    expect(sessionSweepPolicy()).toEqual({
      intervalSeconds: 900,
      batchSize: 500,
      maxBatchesPerRun: 20,
    });
    vi.stubEnv('SESSION_SWEEP_INTERVAL_SECONDS', '60');
    expect(sessionSweepPolicy().intervalSeconds).toBe(60);
    vi.stubEnv('SESSION_SWEEP_BATCH_SIZE', '0');
    expect(() => sessionSweepPolicy()).toThrow(/positive integer/);
  });

  it('keeps going after a failure on the next run, without throwing', async () => {
    prismaMock.session.findMany
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValue([]);
    const worker = new SessionSweepWorker();
    await expect(worker.tick(NOW)).resolves.toBe(0);
    await expect(worker.tick(NOW)).resolves.toBe(0);
  });
});
