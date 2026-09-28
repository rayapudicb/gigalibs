import { useEffect, useState, useCallback } from 'react';
import type { ImportJob, ExportJob, ImportableEntityType } from '../types.js';
import { ENTITY_LABELS } from '../types.js';
import type { ImportExportApi } from '../api/import-export-api.js';

export interface JobStatusDrawerProps {
  api: ImportExportApi;
  isOpen: boolean;
  onClose: () => void;
  /** Filter to a specific entity type */
  entityType?: ImportableEntityType;
}

type Tab = 'imports' | 'exports';

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-slate-100 text-slate-600',
  PARSING: 'bg-blue-100 text-blue-700',
  VALIDATING: 'bg-blue-100 text-blue-700',
  AWAITING_REVIEW: 'bg-amber-100 text-amber-700',
  COMMITTING: 'bg-blue-100 text-blue-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  COMPLETED_WITH_ERRORS: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-slate-100 text-slate-500',
};

export function JobStatusDrawer({ api, isOpen, onClose, entityType }: JobStatusDrawerProps) {
  const [tab, setTab] = useState<Tab>('imports');
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [exportJobs, setExportJobs] = useState<ExportJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const [imports, exports] = await Promise.all([
        api.listImportJobs(entityType, 20),
        api.listExportJobs(entityType, 20),
      ]);
      setImportJobs(imports);
      setExportJobs(exports);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [api, isOpen, entityType]);

  useEffect(() => { void load(); }, [load]);

  if (!isOpen) return null;

  const jobs = tab === 'imports' ? importJobs : exportJobs;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/40" onClick={onClose} />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Import / Export Jobs</h2>
          <div className="flex items-center gap-2">
            <button onClick={load} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition" title="Refresh" disabled={loading}>
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition text-lg">×</button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {(['imports', 'exports'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-sm font-medium capitalize transition ${tab === t ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t}
              <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">
                {t === 'imports' ? importJobs.length : exportJobs.length}
              </span>
            </button>
          ))}
        </div>

        {/* Job list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {error && (
            <div className="p-4 text-sm text-red-600">{error}</div>
          )}
          {!loading && jobs.length === 0 && (
            <div className="p-8 text-center text-sm text-slate-400">No {tab} yet</div>
          )}
          {tab === 'imports' && importJobs.map((job) => (
            <ImportJobRow key={job.id} job={job} api={api} />
          ))}
          {tab === 'exports' && exportJobs.map((job) => (
            <ExportJobRow key={job.id} job={job} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ImportJobRow({ job, api }: { job: ImportJob; api: ImportExportApi }) {
  const handleDownloadErrors = useCallback(async () => {
    try {
      const url = await api.getErrorReportUrl(job.id);
      window.open(url, '_blank');
    } catch (err) {
      console.error(err);
    }
  }, [api, job.id]);

  return (
    <div className="px-5 py-4 hover:bg-slate-50 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800 truncate">{ENTITY_LABELS[job.entityType]}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {job.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{formatDate(job.createdAt)}</p>
          {(job.successRows > 0 || job.failedRows > 0) && (
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-green-600 font-medium">{job.successRows} imported</span>
              {job.failedRows > 0 && <span className="text-red-600 font-medium ml-2">{job.failedRows} failed</span>}
            </p>
          )}
        </div>
        {job.errorReportS3Key && (
          <button onClick={handleDownloadErrors} className="text-xs text-red-600 hover:underline whitespace-nowrap">
            ↓ Errors
          </button>
        )}
      </div>
    </div>
  );
}

function ExportJobRow({ job }: { job: ExportJob }) {
  return (
    <div className="px-5 py-4 hover:bg-slate-50 transition">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{ENTITY_LABELS[job.entityType]}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
              {job.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{formatDate(job.createdAt)}</p>
          {job.rowCount != null && (
            <p className="text-xs text-slate-500 mt-1">{job.rowCount.toLocaleString()} rows</p>
          )}
        </div>
        {job.downloadUrl && (
          <a href={job.downloadUrl} download className="text-xs text-blue-600 hover:underline whitespace-nowrap">
            ↓ Download
          </a>
        )}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}
