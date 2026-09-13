import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormDefinitionBody } from '@gigalibs/forms-engine-nest';

// ─── Simple in-memory cache (30 second TTL) ────────────────────────────────

interface CacheEntry {
  definition: FormDefinitionBody;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

function getCached(key: string): FormDefinitionBody | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.definition;
}

function setCached(key: string, definition: FormDefinitionBody): void {
  cache.set(key, { definition, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export interface UseFormDefinitionOptions {
  /**
   * Tenant ID to scope the definition. When provided the server returns the
   * merged platform+tenant definition (three-level inheritance resolved server-side).
   */
  tenantId?: string;
  /**
   * Base URL for the forms API. Default: '/api'
   */
  apiBase?: string;
}

export interface UseFormDefinitionResult {
  definition: FormDefinitionBody | null;
  loading: boolean;
  error: Error | null;
  /** Force-reload the definition (bypasses cache) */
  refetch: () => void;
}

/**
 * Fetches the effective (merged platform+tenant) form definition at runtime.
 *
 * Admin publishes a change → next component mount or refetch() call
 * picks it up immediately. Zero deployment required.
 *
 * @example
 *   const { definition, loading } = useFormDefinition('ar.invoice', {
 *     tenantId: currentUser.tenantId,
 *   });
 */
export function useFormDefinition(
  formKey: string,
  options: UseFormDefinitionOptions = {},
): UseFormDefinitionResult {
  const { tenantId, apiBase = '/api' } = options;

  const cacheKey = `${formKey}:${tenantId ?? 'platform'}`;

  const [definition, setDefinition] = useState<FormDefinitionBody | null>(
    () => getCached(cacheKey),
  );
  const [loading, setLoading] = useState<boolean>(() => getCached(cacheKey) === null);
  const [error, setError] = useState<Error | null>(null);
  const refetchTokenRef = useRef(0);

  const fetchDefinition = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const url = tenantId
          ? `${apiBase}/forms/${encodeURIComponent(formKey)}?tenantId=${encodeURIComponent(tenantId)}`
          : `${apiBase}/forms/${encodeURIComponent(formKey)}`;

        const response = await fetch(url, { signal });
        if (!response.ok) {
          throw new Error(`Failed to load form definition for "${formKey}": ${response.status}`);
        }
        const data = (await response.json()) as { formKey: string; definition: FormDefinitionBody };
        setCached(cacheKey, data.definition);
        setDefinition(data.definition);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [formKey, tenantId, apiBase, cacheKey],
  );

  useEffect(() => {
    const cached = getCached(cacheKey);
    if (cached) {
      setDefinition(cached);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    void fetchDefinition(controller.signal);
    return () => controller.abort();
  }, [fetchDefinition, cacheKey, refetchTokenRef.current]);

  const refetch = useCallback(() => {
    cache.delete(cacheKey);
    refetchTokenRef.current += 1;
    const controller = new AbortController();
    void fetchDefinition(controller.signal);
  }, [fetchDefinition, cacheKey]);

  return { definition, loading, error, refetch };
}
