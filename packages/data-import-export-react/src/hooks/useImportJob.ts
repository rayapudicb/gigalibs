import { useState, useEffect, useRef, useCallback } from 'react';
import type { ImportJob, ImportJobStatus } from '../types.js';
import type { ImportExportApi } from '../api/import-export-api.js';

const TERMINAL_STATUSES: ImportJobStatus[] = ['COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED'];
const POLL_INTERVAL_MS = 2000;

export interface UseImportJobResult {
  job: ImportJob | null;
  isPolling: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Polls a single import job until it reaches a terminal status.
 * Stops polling automatically when done or when unmounted.
 */
export function useImportJob(
  api: ImportExportApi,
  jobId: string | null,
): UseImportJobResult {
  const [job, setJob] = useState<ImportJob | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetch = useCallback(async () => {
    if (!jobId) return;
    try {
      const fetched = await api.getImportJob(jobId);
      if (!mountedRef.current) return;
      setJob(fetched);
      setError(null);

      if (!TERMINAL_STATUSES.includes(fetched.status)) {
        setIsPolling(true);
        timerRef.current = setTimeout(fetch, POLL_INTERVAL_MS);
      } else {
        setIsPolling(false);
      }
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setIsPolling(false);
    }
  }, [api, jobId]);

  useEffect(() => {
    if (!jobId) return;
    setIsPolling(true);
    void fetch();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [jobId, fetch]);

  return { job, isPolling, error, refetch: fetch };
}
