import { getRandomBytes } from './random-bytes.js';

/**
 * Generate a cryptographically secure random integer in [min, max) (Browser & Node.js).
 */
export const randomInt = (min: number, max: number): number => {
  const range = max - min;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8);
  const maxValid = Math.floor(256 ** bytesNeeded / range) * range;
  let value: number;
  do {
    const bytes = getRandomBytes(bytesNeeded);
    value = 0;
    for (let i = 0; i < bytes.length; i++) {
      value = value * 256 + (bytes[i] ?? 0);
    }
  } while (value >= maxValid);
  return min + (value % range);
};

/**
 * Pick a random element from an array with cryptographic randomness.
 */
export const randomPick = <T>(arr: readonly T[]): T => {
  if (arr.length === 0) throw new Error('Array must not be empty');
  const idx = randomInt(0, arr.length);
  return arr[idx] as T;
};

/**
 * Shuffle an array in-place using Fisher-Yates + crypto random.
 */
export const cryptoShuffle = <T>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
};
