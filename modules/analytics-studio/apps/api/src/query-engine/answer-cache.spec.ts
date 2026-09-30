import { describe, expect, it } from 'vitest';
import type { AnalyticsQueryResultV1 } from '@gigalibs/contracts';
import { AnswerCache } from './answer-cache.js';

const answer = (value: number) => ({ rows: [[value]] }) as unknown as AnalyticsQueryResultV1;
const base = { tenantId: 't', datasetVersionId: 'dv', definitionVersion: 1, measureVersions: {}, spatialScope: { mode: 'UNBOUNDED' } };

// WI-OI-103c: the answer cache is bounded and keyed by everything that can change an answer.
describe('AnswerCache', () => {
  it('gives equal questions equal keys whatever their property order, and changes with anything that matters', () => {
    const key = AnswerCache.key({ ...base, query: { measures: ['a'], dimensions: ['x'] } });
    expect(AnswerCache.key({ ...base, query: { dimensions: ['x'], measures: ['a'] } })).toBe(key);
    for (const change of [
      { tenantId: 'u' },
      { datasetVersionId: 'dv2' },
      { definitionVersion: 2 },
      { measureVersions: { ratio: 'v2' } },
      { spatialScope: { mode: 'SCOPED_PLACES', place_ids: ['p'] } },
    ]) {
      expect(AnswerCache.key({ ...base, ...change, query: { measures: ['a'], dimensions: ['x'] } })).not.toBe(key);
    }
  });

  it('expires entries and keeps at most the configured number, dropping the least recently used', () => {
    let now = 0;
    const cache = new AnswerCache(2, 1000, () => now);
    cache.set('a', answer(1));
    cache.set('b', answer(2));
    expect(cache.get('a')).toEqual(answer(1));
    cache.set('c', answer(3));
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(2);
    now = 1001;
    expect(cache.get('a')).toBeUndefined();
  });
});
