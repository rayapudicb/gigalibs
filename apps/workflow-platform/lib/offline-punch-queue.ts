// WI-OI-120e (U3.2, P1-25): punches that could not be sent wait on the device, kept apart per tenant and user. A queue
// is read and replayed only for the person who recorded it, and signing out removes every queue on the device, so the
// next person can neither see nor submit someone else's punches (times and locations).

/** The single shared key used before WI-OI-120e. Its entries cannot be attributed to anyone, so they are discarded. */
export const LEGACY_PUNCH_QUEUE_KEY = 'gigaops.time.pending';
const QUEUE_PREFIX = `${LEGACY_PUNCH_QUEUE_KEY}:`;

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function punchQueueKey(tenantId: string, userId: string): string {
  if (!tenantId || !userId) throw new Error('A punch queue needs a tenant and a user.');
  return `${QUEUE_PREFIX}${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Removes the pre-WI-OI-120e shared queue without sending it. Returns how many punches it held. */
export function discardLegacyPunchQueue(storage: KeyValueStorage | null = browserStorage()): number {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(LEGACY_PUNCH_QUEUE_KEY);
    storage.removeItem(LEGACY_PUNCH_QUEUE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/** Removes every punch queue on this device: the shared legacy one and each tenant/user queue. */
export function clearOfflinePunchQueues(storage: KeyValueStorage | null = browserStorage()): void {
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key === LEGACY_PUNCH_QUEUE_KEY || key?.startsWith(QUEUE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage may be unavailable (private mode); then nothing was queued either.
  }
}
