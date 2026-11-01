import type { RoundCheckpointDraftV1 } from '@gigalibs/contracts';
import { RoundCheckpointDraftV1 as CheckpointSchema, StageRoundCheckpointBatchV1 } from '@gigalibs/contracts';
import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_BATCH_BYTES, CheckpointTooLargeError, checkpointBatches,
} from '../../../modules/operator-rounds/web/src/checkpoint-batches';

const point = (position: number, instructions: string | null = null): RoundCheckpointDraftV1 => ({
  position, label: `Checkpoint ${position}`, assetRef: '10000000-0000-4000-8000-000000000001', meterRef: null,
  tagCode: `TAG-${position}`, proofMode: 'BARCODE', readingKind: 'BOOLEAN', unitCode: null, nominal: null,
  amberLow: null, amberHigh: null, redLow: null, redHigh: null, choices: [], instructions,
  branchRules: [], photoOnException: false,
});
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

describe('Rounds checkpoint batches', () => {
  it('keeps a small draft in one batch', () => {
    expect(checkpointBatches([point(1), point(2)])).toEqual([[point(1), point(2)]]);
  });

  it('splits a contract-maximum route into bodies the module host accepts, in visit order', () => {
    // 1,000 checkpoints with 4,000-character multibyte instructions: the worst draft the contract permits.
    const route = Array.from({ length: 1000 }, (_, index) => point(index + 1, 'é'.repeat(4000)));
    expect(route.every((checkpoint) => CheckpointSchema.safeParse(checkpoint).success)).toBe(true);
    const batches = checkpointBatches(route);
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.flat().map((checkpoint) => checkpoint.position)).toEqual(route.map((checkpoint) => checkpoint.position));
    for (const [batchIndex, checkpoints] of batches.entries()) {
      expect(bytes(checkpoints)).toBeLessThanOrEqual(CHECKPOINT_BATCH_BYTES);
      const body = {
        routeVersion: 7, uploadId: '20000000-0000-4000-8000-000000000002', batchIndex, batchCount: batches.length, checkpoints,
      };
      expect(StageRoundCheckpointBatchV1.safeParse(body).success).toBe(true);
      expect(bytes(body)).toBeLessThan(100 * 1024);
    }
  });

  it('refuses a single checkpoint larger than a batch with its position', () => {
    const budget = bytes([point(1)]) + 16;
    const draft = [point(1), point(2, 'x'.repeat(200))];
    expect(() => checkpointBatches(draft, budget)).toThrow(CheckpointTooLargeError);
    expect(() => checkpointBatches(draft, budget)).toThrow(/Checkpoint 2 is too large/);
  });

  it('refuses a batch index outside the declared batch count', () => {
    expect(StageRoundCheckpointBatchV1.safeParse({
      routeVersion: 1, uploadId: '20000000-0000-4000-8000-000000000002', batchIndex: 2, batchCount: 2, checkpoints: [point(1)],
    }).success).toBe(false);
  });
});
