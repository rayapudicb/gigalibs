import { describe, expect, it } from 'vitest';
import {
  type SearchProvider,
  type SearchResult,
  aggregateSearch,
  rankSearchResults,
  scoreSearchResult,
} from './index.js';

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

describe('aggregateSearch', () => {
  const ctx = { tenantId: 't1', userId: 'u1' };
  const provider = (moduleKey: string, rows: SearchResult[]): SearchProvider => ({
    moduleKey,
    search: async () => rows,
  });

  it('queries every provider and ranks the union by the one rule', async () => {
    const out = await aggregateSearch(
      [provider('cmms', [results[0]!, results[1]!]), provider('orders', [results[2]!])],
      'pump',
      ctx,
    );
    expect(out.results.map((r) => r.recordId)).toEqual(['2', '1', '3']); // exact, starts-with, subtitle
    expect(out.failedModules).toEqual([]);
  });

  it('isolates a failing provider and still returns the rest', async () => {
    const broken: SearchProvider = {
      moduleKey: 'orders',
      search: async () => {
        throw new Error('down');
      },
    };
    const out = await aggregateSearch([provider('cmms', [results[1]!]), broken], 'pump', ctx);
    expect(out.results.map((r) => r.recordId)).toEqual(['2']);
    expect(out.failedModules).toEqual(['orders']);
  });

  it('only queries the requested modules', async () => {
    const calls: string[] = [];
    const make = (k: string, rows: SearchResult[]): SearchProvider => ({
      moduleKey: k,
      search: async () => {
        calls.push(k);
        return rows;
      },
    });
    const out = await aggregateSearch(
      [make('cmms', [results[1]!]), make('orders', [results[2]!])],
      'pump',
      ctx,
      { moduleKeys: ['cmms'] },
    );
    expect(calls).toEqual(['cmms']);
    expect(out.results.map((r) => r.moduleKey)).toEqual(['cmms']);
  });

  it('short-circuits an empty query without calling providers', async () => {
    let called = false;
    const p: SearchProvider = {
      moduleKey: 'cmms',
      search: async () => {
        called = true;
        return [];
      },
    };
    const out = await aggregateSearch([p], '   ', ctx);
    expect(called).toBe(false);
    expect(out).toEqual({ results: [], failedModules: [] });
  });

  it('de-duplicates a record returned more than once', async () => {
    const out = await aggregateSearch([provider('cmms', [results[1]!, results[1]!])], 'pump', ctx);
    expect(out.results).toHaveLength(1);
  });

  it('fails a provider that returns a non-array, and drops malformed rows from a good one', async () => {
    const bad = { moduleKey: 'x', search: async () => 'nope' } as unknown as SearchProvider;
    const partly = provider('cmms', [
      results[1]!,
      { moduleKey: 'cmms' } as unknown as SearchResult,
    ]);
    const out = await aggregateSearch([bad, partly], 'pump', ctx);
    expect(out.failedModules).toEqual(['x']);
    expect(out.results.map((r) => r.recordId)).toEqual(['2']); // malformed row dropped; 'cmms' not failed
  });

  it('passes the per-provider limit into the context', async () => {
    let seen = -1;
    const p: SearchProvider = {
      moduleKey: 'cmms',
      search: async (_q, c) => {
        seen = c.limit;
        return [];
      },
    };
    await aggregateSearch([p], 'pump', ctx, { perProviderLimit: 7 });
    expect(seen).toBe(7);
  });
});
