import { describe, expect, it } from 'vitest';
import { type SearchResult, rankSearchResults, scoreSearchResult } from './index.js';

// WI-OI-120 (Phase 4, X5 search everywhere): the pure ranking that merges every module's hits into one order.
const results: SearchResult[] = [
  {
    moduleKey: 'cmms',
    recordType: 'work-order',
    recordId: '1',
    title: 'Pump overhaul',
    updatedAt: '2026-03-01',
  },
  {
    moduleKey: 'cmms',
    recordType: 'work-order',
    recordId: '2',
    title: 'Pump',
    updatedAt: '2026-03-02',
  },
  {
    moduleKey: 'orders',
    recordType: 'order',
    recordId: '3',
    title: 'Order 5512',
    subtitle: 'Pump parts',
    updatedAt: '2026-03-03',
  },
  { moduleKey: 'inv', recordType: 'item', recordId: '4', title: 'Valve', updatedAt: '2026-03-04' },
];

describe('scoreSearchResult', () => {
  it('ranks exact > starts-with > contains > subtitle > none', () => {
    expect(scoreSearchResult({ ...results[1]! }, 'pump')).toBe(1000); // exact "Pump"
    expect(scoreSearchResult(results[0]!, 'pump')).toBeGreaterThan(
      scoreSearchResult(results[2]!, 'pump'),
    ); // starts-with > subtitle
    expect(scoreSearchResult(results[2]!, 'pump')).toBe(100); // subtitle only
    expect(scoreSearchResult(results[3]!, 'pump')).toBe(0); // no match
    expect(scoreSearchResult(results[0]!, '')).toBe(0); // empty query
  });
});

describe('rankSearchResults', () => {
  it('drops non-matches and orders by relevance across modules', () => {
    const ranked = rankSearchResults(results, 'pump');
    expect(ranked.map((r) => r.recordId)).toEqual(['2', '1', '3']); // exact, starts-with, subtitle; Valve dropped
    expect(ranked.every((r) => r.score > 0)).toBe(true);
  });

  it('breaks ties by most-recently-updated', () => {
    const tie: SearchResult[] = [
      {
        moduleKey: 'a',
        recordType: 't',
        recordId: 'old',
        title: 'Report',
        updatedAt: '2026-01-01',
      },
      {
        moduleKey: 'b',
        recordType: 't',
        recordId: 'new',
        title: 'Report',
        updatedAt: '2026-05-01',
      },
    ];
    expect(rankSearchResults(tie, 'report').map((r) => r.recordId)).toEqual(['new', 'old']);
  });

  it('caps at the limit', () => {
    expect(rankSearchResults(results, 'pump', 1).map((r) => r.recordId)).toEqual(['2']);
  });
});
