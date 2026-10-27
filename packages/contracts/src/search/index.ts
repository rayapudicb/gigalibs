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

// ─── X5 aggregation: the "search everywhere" shell (providers + merge) ───────────
// The pieces above rank a flat list; these turn "every module contributes hits" into one call. Each module registers a
// SearchProvider; the shell queries them in parallel, isolates per-provider failures, then ranks the union. Pure with
// respect to the injected providers (unit-tested with fakes) — the concrete providers and their index stay in modules.

/** The caller's scope, handed to every provider so each can limit its query to this tenant/user and cap its own fetch. */
export interface SearchContext {
  readonly tenantId: string;
  readonly userId: string;
  /** A soft cap the provider should apply to its own fetch; the aggregator still enforces the global `limit`. */
  readonly limit: number;
}

/** What a module implements to join "search everywhere": given a query and the caller's scope, return its candidate
 *  hits (unranked — the shell ranks every module's hits by the same rule). The provider reads its own data or index. */
export interface SearchProvider {
  /** The module this provider answers for; matches the `moduleKey` on the results it returns. */
  readonly moduleKey: string;
  search(query: string, context: SearchContext): Promise<readonly SearchResult[]>;
}

export interface AggregateSearchOptions {
  /** Cap on the merged, ranked list (default 50). */
  readonly limit?: number;
  /** Per-provider soft cap passed in each provider's context (default = `limit`). */
  readonly perProviderLimit?: number;
  /** When set, only these modules are queried (by `moduleKey`). */
  readonly moduleKeys?: readonly string[];
}

export interface AggregateSearchOutcome {
  readonly results: RankedSearchResult[];
  /** `moduleKey`s whose provider rejected or returned a non-array — so the UI can say some modules did not respond. */
  readonly failedModules: string[];
}

const hasSearchShape = (value: unknown): value is SearchResult =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as SearchResult).title === 'string' &&
  typeof (value as SearchResult).moduleKey === 'string' &&
  typeof (value as SearchResult).recordType === 'string' &&
  typeof (value as SearchResult).recordId === 'string';

/**
 * "Search everywhere": query every provider for a term in parallel, isolate per-provider failures (one slow or broken
 * module never breaks search), drop malformed rows, de-duplicate by module+type+id, then merge and rank into one list
 * with `rankSearchResults`. Pure with respect to the injected providers — unit-tested with fakes. An empty query
 * short-circuits to no results without calling any provider.
 */
export async function aggregateSearch(
  providers: readonly SearchProvider[],
  query: string,
  context: { readonly tenantId: string; readonly userId: string },
  options: AggregateSearchOptions = {},
): Promise<AggregateSearchOutcome> {
  if (norm(query) === '') return { results: [], failedModules: [] };

  const limit = Math.max(0, options.limit ?? 50);
  const perProviderLimit = Math.max(1, options.perProviderLimit ?? Math.max(1, limit));
  const only = options.moduleKeys;
  const selected = only
    ? providers.filter((provider) => only.includes(provider.moduleKey))
    : providers;
  const providerContext: SearchContext = { ...context, limit: perProviderLimit };

  const failedModules: string[] = [];
  const settled = await Promise.allSettled(
    selected.map((provider) => provider.search(query, providerContext)),
  );

  const collected: SearchResult[] = [];
  settled.forEach((outcome, index) => {
    const provider = selected[index];
    if (!provider) return;
    if (outcome.status === 'rejected' || !Array.isArray(outcome.value)) {
      failedModules.push(provider.moduleKey);
      return;
    }
    for (const row of outcome.value) if (hasSearchShape(row)) collected.push(row);
  });

  const seen = new Set<string>();
  const unique = collected.filter((row) => {
    const key = `${row.moduleKey}\u0000${row.recordType}\u0000${row.recordId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { results: rankSearchResults(unique, query, limit), failedModules };
}
