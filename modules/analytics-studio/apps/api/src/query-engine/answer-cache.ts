import { createHash } from 'node:crypto';
import type { AnalyticsQueryResultV1 } from '@gigalibs/contracts';

/**
 * Answer cache (WI-OI-103c). A dataset version never changes, so an answer keyed by tenant, dataset version, model
 * version, resolved formula versions, the normalised question and the caller's place scope stays correct; entries
 * expire only to bound memory. Per API process; a shared cache can come with the jobs infrastructure (WI-OI-104).
 */
export class AnswerCache {
  private readonly entries = new Map<string, { result: AnalyticsQueryResultV1; expiresAt: number }>();

  constructor(
    private readonly maxEntries = 500,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  static key(parts: {
    tenantId: string;
    datasetVersionId: string;
    definitionVersion: number;
    query: unknown;
    measureVersions: Readonly<Record<string, string>>;
    spatialScope: unknown;
    /** WI-OI-109e3: the visible units (or DENIED); null when no unit filter applies. */
    organizationScope?: unknown;
  }): string {
    return createHash('sha256').update(canonical(parts), 'utf8').digest('hex');
  }

  get(key: string): AnalyticsQueryResultV1 | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Least recently used goes first: re-inserting moves a hit to the end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.result;
  }

  set(key: string, result: AnalyticsQueryResultV1): void {
    this.entries.delete(key);
    this.entries.set(key, { result, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }

  get size(): number {
    return this.entries.size;
  }
}

/** JSON with object keys sorted, so equal questions give equal keys whatever their property order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
