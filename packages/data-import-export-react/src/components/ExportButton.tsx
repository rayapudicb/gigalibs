import React, { useState, useCallback } from 'react';
import type { ImportableEntityType, ExportFilters } from '../types.js';
import { ENTITY_LABELS } from '../types.js';
import type { ImportExportApi } from '../api/import-export-api.js';
import { useExportJob } from '../hooks/useExportJob.js';

export interface ExportButtonProps {
  api: ImportExportApi;
  entityType: ImportableEntityType;
  filters?: ExportFilters;
  /** Label override */
  label?: string;
  className?: string;
  disabled?: boolean;
}

export function ExportButton({ api, entityType, filters = {}, label, className, disabled }: ExportButtonProps) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [initiating, setInitiating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { job, isPolling } = useExportJob(api, jobId);

  // Auto-download when complete
  React.useEffect(() => {
    if (job?.status === 'COMPLETED' && job.downloadUrl) {
      const a = document.createElement('a');
      a.href = job.downloadUrl;
      a.download = `${entityType}_export.xlsx`;
      a.click();
      // Reset after download
      setTimeout(() => setJobId(null), 1500);
    }
  }, [job, entityType]);

  const handleExport = useCallback(async () => {
    if (initiating || isPolling) return;
    setError(null);
    setInitiating(true);
    try {
      const { jobId: newJobId } = await api.initiateExport(entityType, filters);
      setJobId(newJobId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setInitiating(false);
    }
  }, [api, entityType, filters, initiating, isPolling]);

  const isActive = initiating || isPolling;
  const statusLabel = job?.status === 'PROCESSING' ? 'Exporting…' : initiating ? 'Starting…' : (label ?? `Export ${ENTITY_LABELS[entityType]}`);

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={handleExport}
        disabled={disabled || isActive}
        className={className ?? 'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition'}
      >
        {isActive && <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />}
        {!isActive && <span>↓</span>}
        {statusLabel}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {job?.status === 'COMPLETED' && !job.downloadUrl && (
        <p className="text-xs text-green-600">✓ Exported {job.rowCount ?? 0} rows</p>
      )}
    </div>
  );
}
