import type { SearchQuery, SearchResult, SearchHit } from './types.js';

export class InMemorySearchEngine<T extends Record<string, any>> {
  constructor(private readonly searchableFields: (keyof T)[]) {}

  search(items: T[], query: SearchQuery): SearchResult<T> {
    const start = Date.now();
    const term = query.term.toLowerCase().trim();

    if (!term) {
      const hits = items.slice(query.offset ?? 0, (query.offset ?? 0) + (query.limit ?? 20)).map((item) => ({
        item,
        score: 1,
      }));
      return { hits, total: items.length, durationMs: Date.now() - start };
    }

    const matchedHits: SearchHit<T>[] = [];

    for (const item of items) {
      let score = 0;
      const highlights: Record<string, string> = {};

      for (const field of this.searchableFields) {
        const val = String(item[field] ?? '').toLowerCase();
        if (val.includes(term)) {
          score += (val === term ? 10 : 2);
          highlights[String(field)] = String(item[field]).replace(
            new RegExp(`(${term})`, 'gi'),
            '<mark>$1</mark>',
          );
        }
      }

      if (score > 0) {
        matchedHits.push({ item, score, highlights });
      }
    }

    matchedHits.sort((a, b) => b.score - a.score);

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const paginated = matchedHits.slice(offset, offset + limit);

    return {
      hits: paginated,
      total: matchedHits.length,
      durationMs: Date.now() - start,
    };
  }
}
