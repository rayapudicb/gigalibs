import React, { useCallback, useReducer, useRef } from 'react';
import type { ImportableEntityType, WizardState, WizardStep, ColumnWarning } from '../types.js';
import { IMPORTABLE_ENTITY_TYPES, ENTITY_LABELS } from '../types.js';
import type { ImportExportApi } from '../api/import-export-api.js';
import { useImportJob } from '../hooks/useImportJob.js';

// ─── State machine ────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_ENTITY'; entityType: ImportableEntityType }
  | { type: 'SET_FILE'; file: File }
  | { type: 'SET_MAPPING'; overrides: Record<string, string> }
  | { type: 'SET_HISTORICAL'; historical: boolean }
  | { type: 'SET_STEP'; step: WizardStep }
  | { type: 'SET_JOB_ID'; jobId: string }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

const INITIAL_STATE: WizardState = {
  step: 'select-entity',
  entityType: null,
  file: null,
  columnMappingOverrides: {},
  historical: false,
  jobId: null,
  job: null,
  error: null,
};

function reducer(state: WizardState, action: Action): WizardState {
  switch (action.type) {
    case 'SET_ENTITY': return { ...state, entityType: action.entityType, step: 'select-file' };
    case 'SET_FILE': return { ...state, file: action.file, step: 'review-warnings' };
    case 'SET_MAPPING': return { ...state, columnMappingOverrides: action.overrides };
    case 'SET_HISTORICAL': return { ...state, historical: action.historical };
    case 'SET_STEP': return { ...state, step: action.step };
    case 'SET_JOB_ID': return { ...state, jobId: action.jobId };
    case 'SET_ERROR': return { ...state, error: action.error, step: action.error ? 'select-file' : state.step };
    case 'RESET': return INITIAL_STATE;
    default: return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface ImportWizardProps {
  api: ImportExportApi;
  /** Called when the wizard is dismissed (X button or Cancel) */
  onClose: () => void;
  /** Called after successful import job completion */
  onComplete?: (jobId: string) => void;
  /** Pre-select entity type, skipping the first step */
  defaultEntityType?: ImportableEntityType;
}

export function ImportWizard({ api, onClose, onComplete, defaultEntityType }: ImportWizardProps) {
  const [state, dispatch] = useReducer(reducer, {
    ...INITIAL_STATE,
    entityType: defaultEntityType ?? null,
    step: defaultEntityType ? 'select-file' : 'select-entity',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = React.useState(0);

  // Poll when we have a jobId
  const { job, isPolling } = useImportJob(api, state.jobId);

  React.useEffect(() => {
    if (!job) return;
    if (job.status === 'COMPLETED' || job.status === 'COMPLETED_WITH_ERRORS') {
      dispatch({ type: 'SET_STEP', step: 'done' });
      if (job.status === 'COMPLETED' && onComplete) onComplete(job.id);
    } else if (job.status === 'FAILED') {
      dispatch({ type: 'SET_STEP', step: 'done' });
    }
  }, [job, onComplete]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
      dispatch({ type: 'SET_ERROR', error: 'Only .xlsx, .xls, or .csv files are supported.' });
      return;
    }
    dispatch({ type: 'SET_FILE', file });
  }, []);

  const handleUpload = useCallback(async () => {
    if (!state.entityType || !state.file) return;
    dispatch({ type: 'SET_ERROR', error: null });
    dispatch({ type: 'SET_STEP', step: 'uploading' });
    setUploadProgress(0);

    try {
      const { jobId, uploadUrl } = await api.initiateImport(state.entityType, state.file.name, {
        historical: state.historical,
        columnMappingOverrides: state.columnMappingOverrides,
      });
      dispatch({ type: 'SET_JOB_ID', jobId });

      await api.uploadFile(uploadUrl, state.file, setUploadProgress);
      await api.enqueueImport(jobId);
      dispatch({ type: 'SET_STEP', step: 'processing' });
    } catch (err: unknown) {
      dispatch({ type: 'SET_ERROR', error: err instanceof Error ? err.message : String(err) });
    }
  }, [api, state]);

  const handleDownloadTemplate = useCallback(async () => {
    if (!state.entityType) return;
    try {
      const blob = await api.downloadTemplate(state.entityType);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.entityType}_import_template.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Template download failed', err);
    }
  }, [api, state.entityType]);

  const handleDownloadErrorReport = useCallback(async () => {
    if (!state.jobId) return;
    try {
      const url = await api.getErrorReportUrl(state.jobId);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Error report download failed', err);
    }
  }, [api, state.jobId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Import {state.entityType ? ENTITY_LABELS[state.entityType] : 'Data'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{stepLabel(state.step)}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 flex items-center justify-center text-lg" aria-label="Close">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {state.error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{state.error}</div>
          )}

          {state.step === 'select-entity' && (
            <EntitySelector onSelect={(et) => dispatch({ type: 'SET_ENTITY', entityType: et })} />
          )}

          {state.step === 'select-file' && (
            <FileSelector
              entityType={state.entityType!}
              fileInputRef={fileInputRef}
              file={state.file}
              historical={state.historical}
              onFileSelect={handleFileSelect}
              onHistoricalChange={(v) => dispatch({ type: 'SET_HISTORICAL', historical: v })}
              onDownloadTemplate={handleDownloadTemplate}
            />
          )}

          {state.step === 'review-warnings' && (
            <ReviewWarnings
              file={state.file!}
              warnings={[]}
              onProceed={handleUpload}
              onBack={() => dispatch({ type: 'SET_STEP', step: 'select-file' })}
            />
          )}

          {state.step === 'uploading' && (
            <UploadProgress progress={uploadProgress} />
          )}

          {state.step === 'processing' && (
            <ProcessingStatus job={job} isPolling={isPolling} />
          )}

          {state.step === 'done' && (
            <ImportResult
              job={job}
              onDownloadErrors={job?.errorReportS3Key ? handleDownloadErrorReport : undefined}
              onClose={onClose}
              onImportMore={() => dispatch({ type: 'RESET' })}
            />
          )}
        </div>

        {/* Footer */}
        {(state.step === 'select-file' || state.step === 'review-warnings') && (
          <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50 rounded-b-2xl">
            {state.step === 'select-file' && (
              <>
                {!defaultEntityType && (
                  <button onClick={() => dispatch({ type: 'SET_STEP', step: 'select-entity' })} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">← Back</button>
                )}
                <button
                  onClick={handleUpload}
                  disabled={!state.file}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg disabled:opacity-40 hover:bg-blue-700 transition"
                >
                  Upload & Process
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EntitySelector({ onSelect }: { onSelect: (et: ImportableEntityType) => void }) {
  return (
    <div>
      <p className="text-sm text-slate-600 mb-4">Select the type of data you want to import:</p>
      <div className="grid grid-cols-2 gap-3">
        {IMPORTABLE_ENTITY_TYPES.map((et) => (
          <button
            key={et}
            onClick={() => onSelect(et)}
            className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left"
          >
            <span className="text-xl">{entityIcon(et)}</span>
            <span className="text-sm font-medium text-slate-800">{ENTITY_LABELS[et]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FileSelector({
  entityType, fileInputRef, file, historical,
  onFileSelect, onHistoricalChange, onDownloadTemplate,
}: {
  entityType: ImportableEntityType;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  historical: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onHistoricalChange: (v: boolean) => void;
  onDownloadTemplate: () => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-slate-700">Select {ENTITY_LABELS[entityType]} file</label>
          <button onClick={onDownloadTemplate} className="text-xs text-blue-600 hover:underline">↓ Download template</button>
        </div>
        <div
          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-blue-400 cursor-pointer transition"
          onClick={() => fileInputRef.current?.click()}
        >
          {file ? (
            <div className="flex items-center justify-center gap-2 text-sm text-slate-700">
              <span className="text-xl">📄</span>
              <span className="font-medium">{file.name}</span>
              <span className="text-slate-400">({formatBytes(file.size)})</span>
            </div>
          ) : (
            <div>
              <p className="text-sm text-slate-500">Drop your Excel file here or <span className="text-blue-600">click to browse</span></p>
              <p className="text-xs text-slate-400 mt-1">.xlsx, .xls, .csv — max 100 MB</p>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileSelect} />
      </div>

      <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <input
          id="historical-import"
          type="checkbox"
          checked={historical}
          onChange={(e) => onHistoricalChange(e.target.checked)}
          className="mt-0.5"
        />
        <label htmlFor="historical-import" className="text-xs text-amber-800">
          <strong>Historical import</strong> — Preserves original timestamps. Requires TENANT_ADMIN or PLATFORM_OPERATOR role.
        </label>
      </div>
    </div>
  );
}

function ReviewWarnings({ file, warnings, onProceed, onBack }: {
  file: File;
  warnings: ColumnWarning[];
  onProceed: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-slate-700">
        <span className="text-xl">📄</span>
        <span className="font-medium">{file.name}</span>
        <span className="text-slate-400">({formatBytes(file.size)})</span>
      </div>

      {warnings.length > 0 && (
        <div>
          <p className="text-sm font-medium text-amber-700 mb-2">⚠ Column warnings ({warnings.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {warnings.map((w, i) => (
              <div key={i} className="text-xs p-2 bg-amber-50 border border-amber-100 rounded-lg">
                <strong>{w.column}</strong>{' '}
                {w.reason === 'UNRECOGNIZED' && `— unrecognized${w.suggestion ? `, did you mean "${w.suggestion}"?` : ''}`}
                {w.reason === 'ALIAS_RESOLVED' && `→ resolved to "${w.resolvedTo}"`}
                {w.reason === 'FORMULA_STRIPPED' && '— formula stripped for security'}
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.length === 0 && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">✓ File ready to upload</div>
      )}

      <div className="flex gap-3 justify-end pt-2">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900">← Back</button>
        <button onClick={onProceed} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Upload & Process
        </button>
      </div>
    </div>
  );
}

function UploadProgress({ progress }: { progress: number }) {
  return (
    <div className="space-y-4 text-center py-6">
      <div className="text-3xl">⬆️</div>
      <p className="text-sm font-medium text-slate-700">Uploading file…</p>
      <div className="w-full bg-slate-100 rounded-full h-2">
        <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <p className="text-xs text-slate-400">{progress}%</p>
    </div>
  );
}

function ProcessingStatus({ job, isPolling }: { job: ReturnType<typeof useImportJob>['job']; isPolling: boolean }) {
  return (
    <div className="space-y-4 text-center py-6">
      <div className="text-3xl">{isPolling ? '⚙️' : '✅'}</div>
      <p className="text-sm font-medium text-slate-700">
        {job?.status === 'PARSING' && 'Parsing file…'}
        {job?.status === 'VALIDATING' && `Validating rows… ${job.totalRows ? `(${job.totalRows} found)` : ''}`}
        {job?.status === 'COMMITTING' && `Importing data… ${job.successRows} committed`}
        {(!job || job.status === 'PENDING') && 'Queued for processing…'}
      </p>
      {isPolling && (
        <div className="flex justify-center">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}

function ImportResult({ job, onDownloadErrors, onClose, onImportMore }: {
  job: ReturnType<typeof useImportJob>['job'];
  onDownloadErrors?: () => void;
  onClose: () => void;
  onImportMore: () => void;
}) {
  const status = job?.status;
  const isSuccess = status === 'COMPLETED';
  const isPartial = status === 'COMPLETED_WITH_ERRORS';
  const isFailed = status === 'FAILED';

  return (
    <div className="space-y-4 text-center py-4">
      <div className="text-4xl">{isSuccess ? '✅' : isPartial ? '⚠️' : '❌'}</div>
      <h3 className="text-base font-semibold text-slate-900">
        {isSuccess && 'Import complete'}
        {isPartial && 'Import completed with errors'}
        {isFailed && 'Import failed'}
      </h3>

      {job && (
        <div className="flex justify-center gap-6 text-sm text-slate-600">
          <span><strong className="text-green-600">{job.successRows}</strong> imported</span>
          {job.failedRows > 0 && <span><strong className="text-red-600">{job.failedRows}</strong> failed</span>}
          {job.totalRows && <span>{job.totalRows} total rows</span>}
        </div>
      )}

      <div className="flex gap-3 justify-center pt-2">
        {onDownloadErrors && (
          <button onClick={onDownloadErrors} className="px-4 py-2 text-sm border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
            ↓ Download error report
          </button>
        )}
        <button onClick={onImportMore} className="px-4 py-2 text-sm border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition">
          Import more
        </button>
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
          Done
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stepLabel(step: WizardStep): string {
  const labels: Record<WizardStep, string> = {
    'select-entity': 'Step 1 of 3 — Choose entity type',
    'select-file': 'Step 2 of 3 — Select file',
    'column-mapping': 'Step 2b — Map columns',
    'review-warnings': 'Step 3 of 3 — Review & upload',
    'uploading': 'Uploading…',
    'processing': 'Processing…',
    'done': 'Complete',
  };
  return labels[step] ?? '';
}

function entityIcon(et: ImportableEntityType): string {
  const icons: Record<ImportableEntityType, string> = {
    assets: '🏭',
    locations: '📍',
    parts: '⚙️',
    vendors: '🤝',
    customers: '👤',
    workforce_resources: '👷',
    departments: '🏢',
  };
  return icons[et] ?? '📋';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
