'use client';

import type { MetadataPanelProps } from '@gigalibs/configuration-react';
import type { SpeedDossierV1 } from '@gigalibs/contracts';
import type { DossierBlock, DossierModelV1 } from '@gigalibs/process-safety-screening-domain';
import { useCallback, useEffect, useState } from 'react';
import { useSpeedApi, useSpeedText } from './hooks.js';
import { type Translate, knowsCode } from './messages/index.js';
import { SpeedApiError, dossierFileUrl, routeExportUrl } from './speed-api.js';

// WI-OI-120ca (SPEED S7; screen spec §2.4, panel speed.dossier-preview; FR-RPT-01 to 05): generate the route's dossier
// and read its files, with each file's SHA-256; export the route as JSON or CSV; and preview the model the files are
// rendered from, section by section. Until the route is approved (R2) the banner says it is a draft.

const button =
  'rounded-md border border-ui-border-base bg-ui-button-neutral px-2.5 py-1 text-sm text-ui-fg-base hover:bg-ui-button-neutral-hover disabled:opacity-50';
const link =
  'rounded-md border border-ui-border-base px-2.5 py-1 text-sm text-ui-fg-interactive hover:bg-ui-button-neutral-hover';
const LEVEL_TEXT: Record<string, string> = {
  CRITICAL: 'text-ui-tag-red-text',
  REVIEW: 'text-ui-tag-orange-text',
  DATA_GAP: 'text-ui-tag-blue-text',
};
const STATUS_TEXT: Record<SpeedDossierV1['status'], string> = {
  QUEUED: 'text-ui-fg-subtle',
  RUNNING: 'text-ui-fg-subtle',
  DONE: 'text-ui-tag-green-text',
  FAILED: 'text-ui-tag-red-text',
};

function Block({ block }: { block: DossierBlock }) {
  if (block.kind === 'paragraph')
    return (
      <p
        className={`text-sm ${block.emphasis === 'statement' ? 'font-semibold text-ui-fg-base' : 'text-ui-fg-subtle'}`}
      >
        {block.text}
      </p>
    );
  if (block.kind === 'tiles')
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {block.items.map((item) => (
          <div
            key={item.label}
            className="rounded-lg border border-ui-border-base bg-ui-bg-base p-3"
          >
            <p className="text-xs text-ui-fg-subtle">{item.label}</p>
            <p className="text-lg font-semibold text-ui-fg-base">{item.value}</p>
          </div>
        ))}
      </div>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ui-fg-subtle">
            {block.columns.map((column) => (
              <th key={column} className="pr-3 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            // Rows have no identity of their own; their order is the model's.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <tr key={index} className="border-t border-ui-border-base align-top">
              {row.map((cell, column) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are positional.
                  key={column}
                  className={`pr-3 ${column === 0 && block.levels?.[index] ? (LEVEL_TEXT[block.levels[index] as string] ?? '') : 'text-ui-fg-base'}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface DossierPreviewViewProps {
  readonly routeId: string;
  readonly model: DossierModelV1 | null;
  /** A server code that stops the preview, such as SPEED_DOSSIER_STALE. */
  readonly previewCode: string | null;
  readonly dossiers: readonly SpeedDossierV1[];
  readonly historyCount: number;
  readonly busy: boolean;
  readonly notice: string | null;
  readonly onGenerate: () => void;
  readonly t: Translate;
}

const say = (t: Translate, code: string) =>
  knowsCode(code) ? t(code) : t('SPEED_REQUEST_FAILED', { status: code });

export function DossierPreviewView({
  routeId,
  model,
  previewCode,
  dossiers,
  historyCount,
  busy,
  notice,
  onGenerate,
  t,
}: DossierPreviewViewProps) {
  const shown = dossiers.slice(0, Math.max(1, historyCount));
  return (
    <section aria-label={t('speed.dossier.label')} className="space-y-4">
      {model?.watermark ? (
        <p
          role="note"
          className="rounded-md border border-ui-tag-orange-border bg-ui-tag-orange-bg p-2 text-sm text-ui-tag-orange-text"
        >
          {t('speed.dossier.banner')}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={busy || model === null}
          onClick={onGenerate}
        >
          {t('speed.dossier.generate')}
        </button>
        <a className={link} href={routeExportUrl(routeId, 'json')} download>
          {t('speed.dossier.exportJson')}
        </a>
        <a className={link} href={routeExportUrl(routeId, 'csv')} download>
          {t('speed.dossier.exportCsv')}
        </a>
      </div>
      {notice ? (
        <p
          role="alert"
          className="rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg p-2 text-sm text-ui-tag-red-text"
        >
          {say(t, notice)}
        </p>
      ) : null}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-ui-fg-base">{t('speed.dossier.files')}</h4>
        {shown.length === 0 ? (
          <p className="text-sm text-ui-fg-muted">{t('speed.dossier.noFiles')}</p>
        ) : (
          <ul className="space-y-2">
            {shown.map((dossier) => (
              <li key={dossier.id} className="rounded-md border border-ui-border-base p-2 text-sm">
                <p>
                  <span className={`font-medium ${STATUS_TEXT[dossier.status]}`}>
                    {t(`speed.dossier.${dossier.status.toLowerCase()}`)}
                  </span>
                  <span className="text-ui-fg-subtle">
                    {' · '}
                    {t('speed.dossier.requested', {
                      time: dossier.requestedAt.replace('T', ' ').slice(0, 19),
                    })}
                  </span>
                </p>
                {dossier.status === 'FAILED' && dossier.errorCode ? (
                  <p className="text-ui-tag-red-text">{say(t, dossier.errorCode)}</p>
                ) : null}
                {dossier.files.map((file) => (
                  <p key={file.format} className="flex flex-wrap items-center gap-2">
                    <a className={link} href={dossierFileUrl(dossier.id, file.format)} download>
                      {t('speed.dossier.download', { format: file.format.toUpperCase() })}
                    </a>
                    <code className="break-all text-xs text-ui-fg-muted">
                      {t('speed.dossier.hash', { hash: file.sha256 })}
                    </code>
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      {previewCode ? (
        <p role="alert" className="text-sm text-ui-tag-orange-text">
          {say(t, previewCode)}
        </p>
      ) : model ? (
        <article className="space-y-4 rounded-lg border border-ui-border-base p-4">
          <header>
            <h3 className="text-lg font-semibold text-ui-fg-base">{model.title}</h3>
            <p className="text-sm text-ui-fg-subtle">{model.subtitle}</p>
          </header>
          {model.sections.map((section) => (
            <section key={section.key} className="space-y-2">
              <h4 className="text-sm font-semibold text-ui-fg-base">{section.title}</h4>
              {section.blocks.map((block, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a section's blocks are positional.
                <Block key={index} block={block} />
              ))}
            </section>
          ))}
        </article>
      ) : (
        <div aria-busy="true" className="h-40 animate-pulse rounded-lg bg-ui-bg-subtle" />
      )}
    </section>
  );
}

/** The registered panel `speed.dossier-preview`. */
export function DossierPreviewPanel({ record, props }: MetadataPanelProps) {
  const t = useSpeedText();
  const api = useSpeedApi();
  const routeId = String(record['id'] ?? '');
  const pollMs = Math.max(1, Number(props['pollSeconds']) || 1) * 1000;
  const historyCount = Math.max(1, Number(props['historyCount']) || 1);
  const [model, setModel] = useState<DossierModelV1 | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [dossiers, setDossiers] = useState<readonly SpeedDossierV1[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const code = (error: unknown) =>
    error instanceof SpeedApiError ? error.code : 'SPEED_REQUEST_FAILED';

  const loadDossiers = useCallback(
    () =>
      api.dossiers(routeId).then(
        (loaded) => setDossiers(loaded.items),
        (error) => setNotice(code(error)),
      ),
    [api, routeId],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new record version reloads the preview.
  useEffect(() => {
    setPreviewCode(null);
    api.dossierPreview(routeId).then(
      (loaded) => setModel(loaded.model),
      (error) => setPreviewCode(code(error)),
    );
    void loadDossiers();
  }, [api, routeId, record['version'], loadDossiers]);

  // While a dossier is queued or being generated, its progress is read again.
  const pending = dossiers.some(
    (dossier) => dossier.status === 'QUEUED' || dossier.status === 'RUNNING',
  );
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void loadDossiers(), pollMs);
    return () => clearInterval(timer);
  }, [pending, pollMs, loadDossiers]);

  const generate = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await api.requestDossier(routeId);
      await loadDossiers();
    } catch (error) {
      setNotice(code(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DossierPreviewView
      routeId={routeId}
      model={model}
      previewCode={previewCode}
      dossiers={dossiers}
      historyCount={historyCount}
      busy={busy}
      notice={notice}
      onGenerate={() => void generate()}
      t={t}
    />
  );
}
