import { z } from 'zod';

// WI-OI-120 (Phase 4, X5 search everywhere): one search box across every module. Each module contributes results for a
// query (from its own data/index); the shell MERGES and RANKS them into one list. This module is the shared "build
// once" core — the result shape and the pure, deterministic ranking — so every module's hits are ordered by the same
// rule. The per-module search providers and whatever index they read are the integration (not here).

export const SearchResultSchema = z
  .object({
    moduleKey: z.string().trim().min(1).max(64),
    recordType: z.string().trim().min(1).max(128),
    recordId: z.string().trim().min(1).max(128),
    title: z.string(),
    subtitle: z.string().optional(),
    /** Where to open the hit. */
    href: z.string().optional(),
    /** ISO timestamp; used only to break ties between equally-relevant hits (most recent first). */
    updatedAt: z.string().optional(),
  })
  .strict();
export type SearchResult = z.infer<typeof SearchResultSchema>;

export interface RankedSearchResult extends SearchResult {
  readonly score: number;
}

const norm = (value: string): string => value.trim().toLowerCase();

/**
 * Relevance of one result to a query (0 = no match, higher = better):
 * exact title · title starts with the query · title contains it · subtitle contains it. A shorter title that starts
 * with the query edges out a longer one. Deterministic and case-insensitive.
 */
export function scoreSearchResult(result: SearchResult, query: string): number {
  const q = norm(query);
  if (q === '') return 0;
  const title = norm(result.title);
  const subtitle = result.subtitle ? norm(result.subtitle) : '';
  if (title === q) return 1000;
  if (title.startsWith(q)) return 600 - Math.min(title.length, 200);
  if (title.includes(q)) return 300 - Math.min(title.length, 200);
  if (subtitle.includes(q)) return 100;
  return 0;
}

/**
 * Merge module results for a query into one ranked list: drop non-matches, order by score then most-recently-updated,
 * and cap at `limit`. The one ordering the whole product's search uses.
 */
export function rankSearchResults(
  results: readonly SearchResult[],
  query: string,
  limit = 50,
): RankedSearchResult[] {
  return results
    .map((result) => ({ ...result, score: scoreSearchResult(result, query) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, Math.max(0, limit));
}
