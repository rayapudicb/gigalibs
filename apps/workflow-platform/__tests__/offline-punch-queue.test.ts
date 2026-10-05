import { describe, expect, it } from 'vitest';
import {
  LEGACY_PUNCH_QUEUE_KEY,
  clearOfflinePunchQueues,
  discardLegacyPunchQueue,
  punchQueueKey,
} from '../lib/offline-punch-queue';

// WI-OI-120e (U3.2, P1-25): offline punches are kept per tenant and user, and signing out removes them all.
function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('offline punch queue', () => {
  it('gives each tenant and user a separate queue', () => {
    const a = punchQueueKey('tenant-1', 'user-a');
    expect(a).not.toBe(punchQueueKey('tenant-1', 'user-b'));
    expect(a).not.toBe(punchQueueKey('tenant-2', 'user-a'));
    expect(a).not.toBe(LEGACY_PUNCH_QUEUE_KEY);
    // A separator inside an ID cannot make two people share a key.
    expect(punchQueueKey('t:1', 'u')).not.toBe(punchQueueKey('t', '1:u'));
    expect(() => punchQueueKey('', 'user-a')).toThrow();
  });

  it('discards the old shared queue without returning its punches to anyone', () => {
    const storage = memoryStorage({ [LEGACY_PUNCH_QUEUE_KEY]: JSON.stringify([{ kind: 'CLOCK_IN' }, { kind: 'CLOCK_OUT' }]) });
    expect(discardLegacyPunchQueue(storage)).toBe(2);
    expect(storage.getItem(LEGACY_PUNCH_QUEUE_KEY)).toBeNull();
    expect(discardLegacyPunchQueue(storage)).toBe(0);
  });

  it("removes every person's queue on sign-out and leaves other device settings alone", () => {
    const storage = memoryStorage({
      [LEGACY_PUNCH_QUEUE_KEY]: '[]',
      [punchQueueKey('tenant-1', 'user-a')]: '[{"kind":"CLOCK_IN"}]',
      [punchQueueKey('tenant-2', 'user-b')]: '[{"kind":"BREAK_START"}]',
      'gigaops.time.device': 'web-device-1',
      'some.other.setting': 'kept',
    });
    clearOfflinePunchQueues(storage);
    expect([...storage.values.keys()].sort()).toEqual(['gigaops.time.device', 'some.other.setting']);
  });
});
