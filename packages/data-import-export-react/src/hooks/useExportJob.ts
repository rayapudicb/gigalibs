import { useState, useEffect, useRef, useCallback } from 'react';
import type { ExportJob, ExportJobStatus } from '../types.js';
import type { ImportExportApi } from '../api/import-export-api.js';

const TERMINAL_STATUSES: ExportJobStatus[] = ['COMPLETED', 'FAILED'];
const POLL_INTERVAL_MS = 2500;

export interface UseExportJobResult {
  job: ExportJob | null;
  isPolling: boolean;
  error: string | null;
}

export function useExportJob(api: ImportExportApi, jobId: string | null): UseExportJobResult {
  const [job, setJob] = useState<ExportJob | null>(null);
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
      const fetched = await api.getExportJob(jobId);
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
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [jobId, fetch]);

  return { job, isPolling, error };
}
