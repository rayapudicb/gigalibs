/**
 * The serialized size one checkpoint batch may reach. The module host accepts request bodies up to Express's 100 KB
 * default; 64 KiB leaves room for the batch envelope and the signed proxy, so the global BFF limit stays unchanged.
 */
export const CHECKPOINT_BATCH_BYTES = 64 * 1024;

/** One checkpoint alone is larger than a batch may be; the author must shorten it before the draft can be saved. */
export class CheckpointTooLargeError extends Error {
  constructor(readonly position: number) {
    super(`Checkpoint ${position} is too large to save; shorten its instructions or labels.`);
    this.name = 'CheckpointTooLargeError';
  }
}

/** Splits a draft's checkpoints, in visit order, into consecutive batches whose JSON stays within `maxBytes`. */
export function checkpointBatches<T extends { position: number }>(
  points: readonly T[],
  maxBytes: number = CHECKPOINT_BATCH_BYTES,
): T[][] {
  const encoder = new TextEncoder();
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 2; // the array brackets
  for (const point of points) {
    const bytes = encoder.encode(JSON.stringify(point)).length + 1; // the separating comma
    if (bytes + 2 > maxBytes) throw new CheckpointTooLargeError(point.position);
    if (current.length > 0 && size + bytes > maxBytes) {
      batches.push(current);
      current = [];
      size = 2;
    }
    current.push(point);
    size += bytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
