import type { IdempotencyEntry, IdempotencyStore, RecordValues } from '@gigalibs/module-sdk';

/**
 * Test support only (WI-OI-120be): an in-process Idempotency-Key store for unit tests of the record dispatcher. The
 * API always passes the durable `ModuleIdempotencyStore`; this folder is excluded from the build.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();

  async claim(
    tenantId: string,
    key: string,
    _operation: string,
    requestHash: string,
  ): Promise<IdempotencyEntry | null> {
    const compound = `${tenantId}:${key}`;
    const existing = this.entries.get(compound);
    if (existing) return existing;
    this.entries.set(compound, { requestHash, state: 'IN_PROGRESS', response: null });
    return null;
  }

  async complete(tenantId: string, key: string, response: RecordValues): Promise<void> {
    const compound = `${tenantId}:${key}`;
    const existing = this.entries.get(compound);
    if (existing)
      this.entries.set(compound, {
        requestHash: existing.requestHash,
        state: 'COMPLETED',
        response,
      });
  }

  async release(tenantId: string, key: string): Promise<void> {
    this.entries.delete(`${tenantId}:${key}`);
  }
}
