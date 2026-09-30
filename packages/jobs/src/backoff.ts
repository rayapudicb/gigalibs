export function exponentialBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1)
    throw new Error('attempt must be a positive safe integer.');
  const exponent = Math.min(attempt - 1, 30);
  return Math.min(maxMs, baseMs * 2 ** exponent);
}
