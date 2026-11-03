import type { CompiledDictionaryManifestV1, DictionaryActionV1, DictionaryTabV1 } from '@gigalibs/contracts';
import { type ComponentType, createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type LookupOption, type RecordActionOffer, type RecordClient, RecordClientError, type RecordPage, type RecordValues } from './record-client.js';
import { usePublishedManifest } from './use-published-manifest.js';
import { useWorkspaceDefaults } from './workspace-defaults.js';
import {
  actionKey,
  describeFailure,
  formWarnings,
  holds,
  gridColumns,
  inputFromValue,
  newRecordDefaults,
  type PlacedField,
  type PlacedPanel,
  parentField,
  placedFields,
  placedPanels,
  offeredActions,
  recordActions,
  recordTitle,
  validateValues,
  createFormFields,
  fieldLabel,
  isMinorMoney,
  moneyFromMinor,
  parameterLookup,
  submittedValues,
  valueWhileTyping,
  type WindowModel,
  windowModel,
  writableValues,
} from './window-model.js';

// WI-OI-120f (F0.4, ADR-0033 D1): one window for every module, drawn only from the published manifest. Rows come from
// the module's record dispatcher; buttons call its registered commands. The window holds no business data of its own,
// denies by default (fields and actions a user may not use are not shown), and shows every state: loading, empty,
// refused, not found, changed by someone else, unavailable. Styling uses the design standard's ui-* tokens only.

/** WI-OI-120bs (SPEED S2b): what a registered panel component receives for the record its tab shows. */
export interface MetadataPanelProps {
  readonly record: RecordValues;
  /** The placement's props, already checked at publish against the panel's declared prop types. */
  readonly props: Readonly<Record<string, string | number | boolean>>;
  readonly client: RecordClient;
  readonly permissions: readonly string[];
  /**
   * WI-OI-120ce: rereads the record quietly (the panel stays mounted), after the panel changed something the record's
   * own fields show (a route's step count after a step is added, say).
   */
  readonly refresh?: () => void;
}

/** Panel components by component key, supplied by the page that hosts the window (the module's web package). */
export type MetadataPanelRegistry = Readonly<Record<string, ComponentType<MetadataPanelProps>>>;

export interface MetadataWindowProps {
  readonly manifest: CompiledDictionaryManifestV1;
  readonly client: RecordClient;
  readonly permissions: readonly string[];
  readonly viewKey?: string;
  /**
   * WI-OI-120 (F0.6): record clients by module key, for the windows a picker may open with "Add new" or "Open"
   * (another module's, such as the Catalogue's product window from Inventory). A module without a client is not offered.
   */
  readonly clients?: Readonly<Record<string, RecordClient>>;
  /** WI-OI-120bs: the module's panel components; a placed panel missing here shows as unavailable, never as a gap. */
  readonly panels?: MetadataPanelRegistry;
  /** WI-OI-120ce: called after an action on one of the window's records succeeds (a page's summary can refresh). */
  readonly onChanged?: () => void;
  /**
   * WI-OI-148 (QA-026, QA-027): a typical set of first records (absence types, asset classes) the empty list offers in
   * one click to someone who may create them. Nothing is created until they click.
   */
  readonly starter?: { readonly label: string; readonly records: readonly RecordValues[] };
}

/** A window opened from a picker, over the current one: create a record, or open the chosen one. */
interface QuickDialog {
  readonly kind: 'create' | 'open';
  readonly target: { readonly moduleKey: string; readonly surfaceKey: string };
  readonly label: string;
  readonly id?: string;
  readonly onCreated?: (id: string) => void;
}

interface WindowEnvironment {
  readonly clients: Readonly<Record<string, RecordClient>>;
  readonly permissions: readonly string[];
  readonly panels: MetadataPanelRegistry;
  readonly open: (dialog: QuickDialog) => void;
  readonly changed?: () => void;
}

const Environment = createContext<WindowEnvironment | null>(null);

type Screen = { readonly kind: 'list' } | { readonly kind: 'create' } | { readonly kind: 'record'; readonly id: string };

const PAGE_SIZE = 25;
const box = 'rounded-lg border border-ui-border-base bg-ui-bg-base';
const button =
  'inline-flex items-center gap-1 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-sm font-medium text-ui-fg-base hover:bg-ui-bg-base-hover disabled:opacity-50';
const primary =
  'inline-flex items-center gap-1 rounded-md bg-ui-button-inverted px-3 py-1.5 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50';
const inputClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none disabled:bg-ui-bg-disabled disabled:text-ui-fg-disabled';

function failureOf(error: unknown) {
  return error instanceof RecordClientError ? describeFailure(error.status, error.message) : describeFailure(undefined, undefined);
}

function newKey(): string {
  return globalThis.crypto.randomUUID();
}

export function MetadataWindow({ manifest, client, permissions, viewKey, clients, panels, onChanged, starter }: MetadataWindowProps) {
  const model = useMemo(() => windowModel(manifest, viewKey), [manifest, viewKey]);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [dialogs, setDialogs] = useState<readonly QuickDialog[]>([]);
  const outer = useContext(Environment);
  // A window shown inside another's dialog reuses that window's dialog stack, so dialogs never nest inside forms.
  const ownModule = manifest.entities[0]?.moduleKey;
  const environment = useMemo<WindowEnvironment>(
    () =>
      outer ?? {
        clients: { ...(clients ?? {}), ...(ownModule ? { [ownModule]: client } : {}) },
        permissions,
        panels: panels ?? {},
        open: (dialog) => setDialogs((current) => [...current, dialog]),
        ...(onChanged ? { changed: onChanged } : {}),
      },
    [outer, clients, ownModule, client, permissions, panels, onChanged],
  );
  if (!model) {
    return <Notice tone="error" title="This window cannot be drawn" text="The published definition declares no view with a main tab." />;
  }
  return (
    <Environment.Provider value={environment}>
    <section className="space-y-4" data-metadata-window={model.view.viewKey}>
      {screen.kind === 'list' && (
        <RecordList
          model={model}
          client={client}
          permissions={permissions}
          onOpen={(id) => setScreen({ kind: 'record', id })}
          onNew={canCreate(model, model.rootTab, permissions) ? () => setScreen({ kind: 'create' }) : undefined}
          starter={canCreate(model, model.rootTab, permissions) ? starter : undefined}
        />
      )}
      {screen.kind === 'create' && (
        <RecordForm
          model={model}
          tab={model.rootTab}
          client={client}
          permissions={permissions}
          onCancel={() => setScreen({ kind: 'list' })}
          onSaved={(record) => setScreen({ kind: 'record', id: String(record.id) })}
        />
      )}
      {screen.kind === 'record' && (
        <RecordDetail model={model} client={client} permissions={permissions} id={screen.id} onBack={() => setScreen({ kind: 'list' })} />
      )}
      {dialogs.map((dialog, index) => (
        <QuickDialogView key={index} dialog={dialog} onClose={() => setDialogs((current) => current.slice(0, index))} />
      ))}
    </section>
    </Environment.Provider>
  );
}

/**
 * WI-OI-120 (F0.6): the window that owns a picked record, over the current one. "Add new" shows its create form and
 * hands the new record back to the picker; "Open" shows the chosen record. Same fields, rules and permissions as the
 * window on its own screen, because it is that window.
 */
function QuickDialogView({ dialog, onClose }: { dialog: QuickDialog; onClose: () => void }) {
  const environment = useContext(Environment);
  const client = environment?.clients[dialog.target.moduleKey];
  const state = usePublishedManifest({ moduleKey: dialog.target.moduleKey, entityKey: dialog.target.surfaceKey, surfaceKey: dialog.target.surfaceKey });
  const model = state.status === 'ready' ? windowModel(state.manifest) : null;
  const title = dialog.kind === 'create' ? `New ${dialog.label}` : dialog.label;
  let content: ReactNode;
  if (!client || !environment) content = <Notice tone="error" title="Not available here" text={`This screen cannot open ${dialog.label} records.`} />;
  else if (state.status === 'loading') content = <p className="text-sm text-ui-fg-muted">Loading…</p>;
  else if (state.status !== 'ready' || !model) content = <Notice tone="error" title="This window is not available" text={state.status === 'ready' ? 'Its definition declares no view.' : state.message} />;
  else if (dialog.kind === 'open' && dialog.id) content = <RecordDetail model={model} client={client} permissions={environment.permissions} id={dialog.id} onBack={onClose} />;
  else if (!canCreate(model, model.rootTab, environment.permissions)) content = <Notice tone="error" title="No access" text={`You may not create ${dialog.label} records.`} />;
  else
    content = (
      <RecordForm
        model={model}
        tab={model.rootTab}
        client={client}
        permissions={environment.permissions}
        onCancel={onClose}
        onSaved={(record) => {
          dialog.onCreated?.(String(record.id));
          onClose();
        }}
      />
    );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ui-bg-overlay p-4 sm:p-8"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className={`${box} w-full max-w-3xl space-y-3 p-4 shadow-xl`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ui-fg-base">{title}</h2>
          <button type="button" className={button} onClick={onClose}>
            Close
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}

/** A tab offers New only when the user may fill at least one of its fields. */
function canCreate(model: WindowModel, tab: DictionaryTabV1, permissions: readonly string[]): boolean {
  return placedFields(model, tab, {}, permissions, 'CREATE').some((placed) => !placed.readOnly);
}

/** Labels for the lookup columns of a page: one lookup per column, by the ids on the page. */
function useLookupLabels(client: RecordClient, columns: readonly PlacedField[], items: readonly RecordValues[] | null) {
  const [labels, setLabels] = useState<Readonly<Record<string, Readonly<Record<string, string>>>>>({});
  useEffect(() => {
    if (!items || items.length === 0) return;
    let active = true;
    const lookups = columns.filter((placed) => placed.resolverKey);
    void Promise.all(
      lookups.map(async (placed) => {
        const ids = [...new Set(items.map((item) => item[placed.field.fieldKey]).filter((id): id is string => typeof id === 'string' && id.length > 0))];
        if (ids.length === 0) return [placed.field.fieldKey, {}] as const;
        try {
          const options = await client.lookup(placed.resolverKey!, { ids });
          return [placed.field.fieldKey, Object.fromEntries(options.map((option) => [option.value, option.label]))] as const;
        } catch {
          return [placed.field.fieldKey, {}] as const;
        }
      }),
    ).then((entries) => {
      if (active) setLabels(Object.fromEntries(entries));
    });
    return () => {
      active = false;
    };
  }, [client, columns, items]);
  return labels;
}

function Notice({ tone, title, text, action }: { tone: 'error' | 'info'; title: string; text: string; action?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`${box} p-4`}>
      <p className={`text-sm font-medium ${tone === 'error' ? 'text-ui-fg-error' : 'text-ui-fg-base'}`}>{title}</p>
      <p className="mt-1 text-sm text-ui-fg-subtle">{text}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * WI-OI-148 (QA-029): what a new record needs first (its required pickers), so an empty list names the masters to have
 * ready; each picker offers "Add new" or says where those records are made.
 */
function prerequisites(model: WindowModel, tab: DictionaryTabV1, permissions: readonly string[]): string {
  const needs = placedFields(model, tab, {}, permissions, 'CREATE')
    .filter((placed) => placed.required && !placed.readOnly && placed.resolverKey)
    .map((placed) => fieldLabel(placed.field).toLowerCase());
  if (needs.length === 0) return '';
  const list = needs.length === 1 ? needs[0] : `${needs.slice(0, -1).join(', ')} and ${needs.at(-1)}`;
  return ` Each one needs a ${list}.`;
}

/** The record's actions that take no parameters (a click and, at most, a confirmation). */
function rowActions(model: WindowModel, entityKey: string, record: RecordValues, permissions: readonly string[]): DictionaryActionV1[] {
  return recordActions(model, entityKey, record, permissions).filter((action) => (action.parameters ?? []).length === 0);
}

function StarterButton({
  starter,
  onAdd,
}: {
  starter: NonNullable<MetadataWindowProps['starter']>;
  onAdd: (records: readonly RecordValues[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        className={button}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailure(null);
          try {
            await onAdd(starter.records);
          } catch (error) {
            setFailure(failureOf(error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Adding…' : `${starter.label} (${starter.records.length})`}
      </button>
      {failure ? <span className="text-xs text-ui-fg-error">{failure}</span> : null}
    </span>
  );
}

function RecordList({
  model,
  client,
  permissions,
  onOpen,
  onNew,
  starter,
  tab = model.rootTab,
  parentId,
}: {
  model: WindowModel;
  client: RecordClient;
  permissions: readonly string[];
  onOpen?: ((id: string) => void) | undefined;
  onNew?: (() => void) | undefined;
  starter?: MetadataWindowProps['starter'] | undefined;
  tab?: DictionaryTabV1;
  parentId?: string;
}) {
  const view = model.view;
  const isRoot = tab === model.rootTab;
  const columns = useMemo(() => gridColumns(model, tab, permissions), [model, tab, permissions]);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState({ page: 1, search: '', sort: isRoot ? view.defaultSortField : undefined, direction: view.defaultSortDirection });
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; page: RecordPage } | { status: 'failed'; message: string; kind: string }>({
    status: 'loading',
  });

  // WI-OI-149 (QA-038): actions that need nothing more than a click (approve, release) run from the row itself.
  const [acting, setActing] = useState<string | null>(null);
  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const page = await client.list(tab.targetEntityKey, {
        page: query.page,
        pageSize: PAGE_SIZE,
        ...(query.search ? { search: query.search } : {}),
        ...(query.sort ? { sort: query.sort, direction: query.direction } : {}),
        ...(parentId ? { parentId } : {}),
      });
      setState({ status: 'ready', page });
    } catch (error) {
      const failure = failureOf(error);
      setState({ status: 'failed', message: failure.message, kind: failure.kind });
    }
  }, [client, tab.targetEntityKey, query, parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const labels = useLookupLabels(client, columns, state.status === 'ready' ? state.page.items : null);
  const sortable = isRoot && view.defaultSortField ? new Set([view.defaultSortField]) : new Set<string>();
  const searchable = isRoot && (view.searchFields?.length ?? 0) > 0;
  const lastPage = state.status === 'ready' ? Math.max(1, Math.ceil(state.page.total / PAGE_SIZE)) : 1;

  const quick =
    state.status === 'ready' && state.page.items.some((record) => rowActions(model, tab.targetEntityKey, record, permissions).length > 0);
  return (
    <div className="space-y-3">
      {isRoot && (
        <header className="flex flex-wrap items-center justify-end gap-3">
          {/* WI-OI-145: the module tab bar already names this list; the title stays for assistive technology. */}
          <h2 className="sr-only">{view.label}</h2>
          <div className="flex items-center gap-2">
            {/* The screen's own buttons (web-sdk ModulePage actions) sit here, beside the search. */}
            <div data-page-actions-slot="" className="flex items-center gap-2" />
            {searchable && (
              <form
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  setQuery((current) => ({ ...current, page: 1, search: search.trim() }));
                }}
              >
                <input aria-label={`Search ${view.label}`} className={inputClass} placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />
              </form>
            )}
            {onNew && (
              <button type="button" className={primary} onClick={onNew}>
                New
              </button>
            )}
          </div>
        </header>
      )}
      {state.status === 'loading' && <p className="text-sm text-ui-fg-muted">Loading…</p>}
      {state.status === 'failed' && (
        <Notice tone="error" title={state.kind === 'FORBIDDEN' ? 'No access' : 'Could not load records'} text={state.message} action={<button type="button" className={button} onClick={() => void load()}>Try again</button>} />
      )}
      {state.status === 'ready' && state.page.items.length === 0 && (
        <Notice
          tone="info"
          title="No records yet"
          text={onNew ? `${starter ? `${starter.label} adds a typical set you can change, or use` : 'Use'} New to create the first one.${prerequisites(model, tab, permissions)}` : 'Nothing has been recorded here yet.'}
          action={
            starter ? (
              <StarterButton
                starter={starter}
                onAdd={async (records) => {
                  for (const values of records) await client.create(tab.targetEntityKey, values, newKey());
                  await load();
                }}
              />
            ) : undefined
          }
        />
      )}
      {state.status === 'ready' && state.page.items.length > 0 && (
        <div className={`${box} overflow-x-auto`}>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-ui-border-base bg-ui-bg-subtle text-ui-fg-subtle">
              <tr>
                {columns.map(({ field }) => (
                  <th key={field.fieldKey} scope="col" className="px-3 py-2 font-medium">
                    {sortable.has(field.fieldKey) ? (
                      <button
                        type="button"
                        className="font-medium hover:text-ui-fg-base"
                        onClick={() => setQuery((current) => ({ ...current, page: 1, sort: field.fieldKey, direction: current.direction === 'ASC' ? 'DESC' : 'ASC' }))}
                      >
                        {fieldLabel(field)} {query.sort === field.fieldKey ? (query.direction === 'ASC' ? '↑' : '↓') : ''}
                      </button>
                    ) : (
                      field.label
                    )}
                  </th>
                ))}
                {quick ? <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody>
              {state.page.items.map((record) => (
                <tr
                  key={String(record.id)}
                  className={`border-b border-ui-border-base last:border-0 ${onOpen ? 'cursor-pointer hover:bg-ui-bg-base-hover' : ''}`}
                  onClick={onOpen ? () => onOpen(String(record.id)) : undefined}
                >
                  {columns.map((placed) => (
                    <td key={placed.field.fieldKey} className="px-3 py-2 text-ui-fg-base">
                      <DisplayValue placed={placed} value={record[placed.field.fieldKey]} label={labels[placed.field.fieldKey]?.[String(record[placed.field.fieldKey])]} />
                    </td>
                  ))}
                  {quick ? (
                    <td className="px-3 py-2 text-right" onClick={(event) => event.stopPropagation()}>
                      <span className="inline-flex gap-2">
                        {rowActions(model, tab.targetEntityKey, record, permissions).map((action) => (
                          <button
                            key={action.actionKey}
                            type="button"
                            className={button}
                            disabled={acting !== null}
                            onClick={async () => {
                              if (action.confirmationPrompt && !globalThis.confirm(action.confirmationPrompt)) return;
                              setActing(`${String(record.id)}:${action.actionKey}`);
                              try {
                                const read = typeof record.version === 'number' ? { expectedVersion: record.version } : {};
                                await client.action(tab.targetEntityKey, String(record.id), actionKey(action, tab.targetEntityKey), read, newKey());
                                await load();
                              } catch (error) {
                                globalThis.alert(failureOf(error).message);
                              } finally {
                                setActing(null);
                              }
                            }}
                          >
                            {acting === `${String(record.id)}:${action.actionKey}` ? `${action.label}…` : action.label}
                          </button>
                        ))}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.status === 'ready' && state.page.total > PAGE_SIZE && (
        <nav className="flex items-center justify-end gap-2 text-sm text-ui-fg-subtle" aria-label="Pages">
          <button type="button" className={button} disabled={query.page <= 1} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))}>
            Previous
          </button>
          <span>
            Page {query.page} of {lastPage}
          </span>
          <button type="button" className={button} disabled={query.page >= lastPage} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))}>
            Next
          </button>
        </nav>
      )}
    </div>
  );
}

function DisplayValue({ placed, value, label }: { placed: PlacedField; value: unknown; label?: string | undefined }) {
  const { field } = placed;
  if (value === null || value === undefined || value === '') return <span className="text-ui-fg-muted">—</span>;
  if (field.maskOnDisplay) return <span>••••</span>;
  if (field.type === 'BOOLEAN') return <span>{value ? 'Yes' : 'No'}</span>;
  if (label) return <span>{label}</span>;
  const option = placed.options?.find((candidate) => candidate.value === String(value));
  if (option) return <span>{option.label}</span>;
  if (field.type === 'DATETIME' && typeof value === 'string') return <span>{value.slice(0, 16).replace('T', ' ')}</span>;
  if (isMinorMoney(field)) return <span className="tabular-nums">{moneyFromMinor(value)}</span>;
  if (typeof value === 'object') return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  return <span>{String(value)}</span>;
}

function RecordForm({
  model,
  tab,
  client,
  permissions,
  record,
  fixed = {},
  onCancel,
  onSaved,
}: {
  model: WindowModel;
  tab: DictionaryTabV1;
  client: RecordClient;
  permissions: readonly string[];
  /** Present when editing; absent when creating. */
  record?: RecordValues;
  /** Values set by the window, such as the parent of a child record. */
  fixed?: RecordValues;
  onCancel: () => void;
  onSaved: (record: RecordValues) => void;
}) {
  // WI-OI-120r (S1): a new record starts with the window's defaults.
  const [values, setValues] = useState<Record<string, unknown>>(() => ({ ...(record ?? newRecordDefaults(model, tab)), ...fixed }));
  // WI-OI-153: a field defaulting to the workspace currency takes it once the workspace profile is read, unless the
  // person has already filled it.
  const workspace = useWorkspaceDefaults();
  // biome-ignore lint/correctness/useExhaustiveDependencies: filled once, when the workspace currency arrives.
  useEffect(() => {
    if (record || !workspace.defaultCurrency) return;
    const fixedDefaults = newRecordDefaults(model, tab);
    const computed = newRecordDefaults(model, tab, new Date(), workspace);
    setValues((current) => {
      const next = { ...current };
      let changed = false;
      for (const [fieldKey, value] of Object.entries(computed)) {
        if (fieldKey in fixedDefaults || fieldKey in fixed) continue;
        if (next[fieldKey] === undefined || next[fieldKey] === '') {
          next[fieldKey] = value;
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [workspace.defaultCurrency]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per form: a retry after a network failure replays the first answer instead of saving twice.
  const [idempotencyKey] = useState(newKey);
  const placed = placedFields(model, tab, values, permissions, record ? 'EDIT' : 'CREATE').filter((candidate) => !(candidate.field.fieldKey in fixed));
  const fields = record ? placed : createFormFields(placed);

  async function submit(event: FormEvent) {
    event.preventDefault();
    // WI-OI-120ce: text is kept as typed while editing and trimmed here, once.
    const saving = submittedValues(fields, values);
    const found = validateValues(model, fields, saving, tab.targetEntityKey);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const saved = record
        ? await client.update(tab.targetEntityKey, String(record.id), writableValues(fields, saving, record), Number(record.version))
        : await client.create(tab.targetEntityKey, { ...writableValues(fields, saving), ...fixed }, idempotencyKey);
      onSaved(saved);
    } catch (error) {
      // WI-OI-120r (S1): the server's field rules name each field, shown under it as the form's own checks are.
      if (error instanceof RecordClientError && Object.keys(error.fields).length > 0) {
        setErrors(error.fields);
        setFailure('Check the highlighted fields.');
      } else {
        setFailure(failureOf(error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  const warnings = Object.values(formWarnings(model, tab.targetEntityKey, values));

  return (
    <form className={`${box} space-y-4 p-4`} onSubmit={(event) => void submit(event)} noValidate>
      <h3 className="text-sm font-semibold text-ui-fg-base">{record ? `Edit ${tab.label}` : `New ${tab.label}`}</h3>
      {failure && <Notice tone="error" title="Not saved" text={failure} />}
      {warnings.length > 0 && <Notice tone="info" title="Please check" text={warnings.join(' ')} />}
      <FieldSections tab={tab} fields={fields} values={values} errors={errors} client={client} onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))} />
      <div className="flex justify-end gap-2">
        <button type="button" className={button} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={primary} disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}

function FieldSections({
  tab,
  fields,
  values,
  errors,
  client,
  onChange,
  panels = [],
  panelSlot,
}: {
  tab: DictionaryTabV1;
  fields: readonly PlacedField[];
  values: RecordValues;
  errors: Readonly<Record<string, string>>;
  client: RecordClient;
  onChange?: (fieldKey: string, value: unknown) => void;
  /** WI-OI-120bs: panels shown with the fields (read view only), merged by position within their section. */
  panels?: readonly PlacedPanel[];
  panelSlot?: (panel: PlacedPanel) => ReactNode;
}) {
  type Item = { readonly key: string; readonly position: number; readonly span: number; readonly node: ReactNode };
  const sections = [...tab.sections].sort((a, b) => a.position - b.position);
  const declared = (sectionKey: string | undefined) => !!sectionKey && sections.some((section) => section.sectionKey === sectionKey);
  const fieldItem = (placed: PlacedField): Item => ({
    key: `field:${placed.field.fieldKey}`,
    position: placed.placement.position,
    span: placed.placement.span,
    node: <FieldInput placed={placed} value={values[placed.field.fieldKey]} error={errors[placed.field.fieldKey]} client={client} onChange={onChange} />,
  });
  const panelItem = (panel: PlacedPanel): Item => ({
    key: `panel:${panel.placement.panelKey}`,
    position: panel.placement.position,
    span: panel.placement.span,
    node: panelSlot ? panelSlot(panel) : null,
  });
  const itemsFor = (inSection: (sectionKey: string | undefined) => boolean): Item[] =>
    [
      ...fields.filter((placed) => inSection(placed.placement.sectionKey)).map(fieldItem),
      ...(panelSlot ? panels.filter((panel) => inSection(panel.placement.sectionKey)).map(panelItem) : []),
    ].sort((a, b) => a.position - b.position);
  const groups = sections.map((section) => ({ key: section.sectionKey, label: section.label, items: itemsFor((key) => key === section.sectionKey) }));
  const loose = itemsFor((key) => !declared(key));
  return (
    <div className="space-y-4">
      {[...groups, ...(loose.length > 0 ? [{ key: '_', label: '', items: loose }] : [])].map((group) =>
        group.items.length === 0 ? null : (
          <fieldset key={group.key} className="space-y-3">
            {group.label ? <legend className="text-xs font-medium uppercase text-ui-fg-muted">{group.label}</legend> : null}
            <div className="grid grid-cols-12 gap-3">
              {group.items.map((item) => (
                <div key={item.key} className="col-span-12 space-y-1" style={{ gridColumn: `span ${item.span} / span ${item.span}` }}>
                  {item.node}
                </div>
              ))}
            </div>
          </fieldset>
        ),
      )}
    </div>
  );
}

/**
 * WI-OI-120bs: one placed panel. The component comes from the registry the page supplies; a panel the registry does
 * not hold is shown as unavailable (named, so it can be fixed), never silently left out.
 */
export function MetadataPanel({
  panel,
  registry,
  record,
  client,
  permissions,
  refresh,
}: {
  panel: PlacedPanel;
  registry: MetadataPanelRegistry;
  record: RecordValues;
  client: RecordClient;
  permissions: readonly string[];
  refresh?: () => void;
}) {
  const Component = registry[panel.placement.componentKey];
  if (!Component) {
    return (
      <div data-panel-unavailable={panel.placement.componentKey}>
        <Notice tone="error" title="This panel is not available" text={`The page does not provide ${panel.placement.componentKey}.`} />
      </div>
    );
  }
  return (
    <div data-panel={panel.placement.panelKey}>
      <Component
        record={record}
        props={panel.placement.props}
        client={client}
        permissions={permissions}
        {...(refresh ? { refresh } : {})}
      />
    </div>
  );
}

/** WI-OI-120bs: the panels of a panel-only record tab, in position order on a 12-column grid. */
export function MetadataPanels({
  panels,
  registry,
  record,
  client,
  permissions,
  refresh,
}: {
  panels: readonly PlacedPanel[];
  registry: MetadataPanelRegistry;
  record: RecordValues;
  client: RecordClient;
  permissions: readonly string[];
  refresh?: () => void;
}) {
  if (panels.length === 0) return <p className="text-sm text-ui-fg-muted">Nothing to show here.</p>;
  return (
    <div className="grid grid-cols-12 gap-3">
      {panels.map((panel) => (
        <div key={panel.placement.panelKey} className="col-span-12" style={{ gridColumn: `span ${panel.placement.span} / span ${panel.placement.span}` }}>
          <MetadataPanel panel={panel} registry={registry} record={record} client={client} permissions={permissions} {...(refresh ? { refresh } : {})} />
        </div>
      ))}
    </div>
  );
}

function FieldInput({
  placed,
  value,
  error,
  client,
  onChange,
}: {
  placed: PlacedField;
  value: unknown;
  error: string | undefined;
  client: RecordClient;
  onChange: ((fieldKey: string, value: unknown) => void) | undefined;
}) {
  const { field, readOnly, required } = placed;
  const id = `field-${field.fieldKey}`;
  const disabled = readOnly || !onChange;
  const set = (input: string | boolean) => onChange?.(field.fieldKey, valueWhileTyping(field, input));
  const label = (
    <label htmlFor={id} className="text-xs font-medium text-ui-fg-subtle">
      {fieldLabel(field)}
      {required ? <span className="text-ui-fg-error"> *</span> : null}
    </label>
  );
  let control: ReactNode;
  if (field.type === 'BOOLEAN') {
    control = <input id={id} type="checkbox" checked={value === true} disabled={disabled} onChange={(event) => set(event.target.checked)} />;
  } else if (field.type === 'TEXTAREA') {
    control = <textarea id={id} className={inputClass} rows={3} value={inputFromValue(field, value)} disabled={disabled} onChange={(event) => set(event.target.value)} />;
  } else if (field.type === 'SELECT') {
    control = <SelectInput id={id} placed={placed} value={value} disabled={disabled} onChange={set} />;
  } else if (field.type === 'REFERENCE') {
    // WI-OI-149: the picked option's attributes fill the reference's `fills` fields (a product's code, name, unit).
    const pick = (option: LookupOption) => {
      set(option.value);
      for (const [attribute, target] of Object.entries(placed.fills ?? {})) {
        const filled = option.attributes?.[attribute];
        if (filled !== undefined) onChange?.(target, filled);
      }
    };
    control = <LookupInput id={id} placed={placed} value={value} disabled={disabled} client={client} onChange={set} onPick={pick} />;
  } else {
    const type = field.type === 'DATE' ? 'date' : field.type === 'DATETIME' ? 'datetime-local' : field.type === 'EMAIL' ? 'email' : field.type === 'URL' ? 'url' : 'text';
    const decimal = field.type === 'NUMBER' || field.type === 'CURRENCY' || field.type === 'INTEGER';
    control = (
      <input
        id={id}
        type={type}
        inputMode={decimal ? 'decimal' : undefined}
        className={inputClass}
        value={inputFromValue(field, value)}
        disabled={disabled}
        onChange={(event) => set(event.target.value)}
      />
    );
  }
  return (
    <>
      {label}
      {control}
      {field.helpText ? <p className="text-xs text-ui-fg-muted">{field.helpText}</p> : null}
      {error ? (
        <p role="alert" className="text-xs text-ui-fg-error">
          {error}
        </p>
      ) : null}
    </>
  );
}

function SelectInput({ id, placed, value, disabled, onChange }: { id: string; placed: PlacedField; value: unknown; disabled: boolean; onChange: (input: string) => void }) {
  const options = placed.options ?? [];
  return (
    <select id={id} className={inputClass} value={value === null || value === undefined ? '' : String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Select…</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/**
 * WI-OI-148 (QA-028): where the masters of a picker without "Add new" are created, so an empty picker is never a dead
 * end (organization units and sites in Settings, skills on their Workforce screen, places on the map).
 */
const MASTER_HOMES: Readonly<Record<string, { readonly href: string; readonly label: string }>> = {
  'organization-units': { href: '/settings/organization', label: 'Settings › Organization & hierarchy' },
  'speed-sites': { href: '/settings/organization', label: 'Settings › Organization & hierarchy' },
  'workspace-sites': { href: '/maps', label: 'Places & maps' },
  'wf-capabilities': { href: '/gigaops/capabilities', label: 'Workforce › Skills & qualifications' },
  'finance-books': { href: '/finance/set-up', label: 'General ledger › Set up a book' },
};

function LookupInput({
  id,
  placed,
  value,
  disabled,
  client,
  onChange,
  onPick,
}: {
  id: string;
  placed: PlacedField;
  value: unknown;
  disabled: boolean;
  client: RecordClient;
  onChange: (input: string) => void;
  /** Called instead of onChange when the person picks an option, with the whole option (its attributes). */
  onPick?: (option: LookupOption) => void;
}) {
  // WI-OI-120ce: one searchable field (a combobox), not a search box above a separate list: type to search, choose with
  // the mouse or the arrow keys and Enter; the chosen record shows by its name.
  const resolverKey = placed.resolverKey;
  const current = typeof value === 'string' && value ? value : null;
  const [options, setOptions] = useState<readonly LookupOption[]>([]);
  const [chosen, setChosen] = useState<LookupOption | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const listId = `${id}-options`;
  // The chosen record's name, looked up by its id when the form opens with a value.
  useEffect(() => {
    if (!resolverKey || !current || chosen?.value === current) return;
    let live = true;
    client
      .lookup(resolverKey, { ids: [current] })
      .then((found) => {
        if (live) setChosen(found.find((option) => option.value === current) ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, resolverKey, current, chosen]);
  // WI-OI-149 (QA-038): a required picker with exactly one choice (one unit, one book, one warehouse) takes it at once,
  // so the person never picks the only option; anything else waits for the person.
  useEffect(() => {
    if (!resolverKey || current || disabled || !placed.required) return;
    let live = true;
    client
      .lookup(resolverKey, {})
      .then((found) => {
        if (!live || found.length !== 1) return;
        const only = found[0]!;
        setChosen(only);
        if (onPick) onPick(only);
        else onChange(only.value);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Once per field: the first answer decides.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, resolverKey]);
  // The options, while the list is open; a short pause after typing before each search.
  useEffect(() => {
    if (!resolverKey || !open) return;
    let live = true;
    const timer = setTimeout(() => {
      client
        .lookup(resolverKey, search.trim() ? { search: search.trim() } : {})
        .then((found) => {
          if (live) {
            setOptions(found);
            setActive(0);
            setFailure(null);
          }
        })
        .catch((error: unknown) => {
          if (live) setFailure(failureOf(error).message);
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [client, resolverKey, search, open]);
  const environment = useContext(Environment);
  const target = placed.createWith;
  const targetClient = target ? environment?.clients[target.moduleKey] : undefined;
  const label = placed.field.label;
  const canAdd = Boolean(!disabled && target && targetClient && environment && holds(environment.permissions, target.permission));
  const canOpen = Boolean(target && targetClient && current);
  if (!resolverKey) return <p className="text-xs text-ui-fg-error">This field has no lookup.</p>;
  const choose = (option: LookupOption) => {
    setChosen(option);
    setSearch('');
    setOpen(false);
    if (onPick) onPick(option);
    else onChange(option.value);
  };
  const shownName = current ? (chosen?.value === current ? chosen.label : '') : '';
  return (
    <div className="space-y-1">
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
          className={`${inputClass} pr-8`}
          placeholder={disabled ? '' : `Search ${label}`}
          disabled={disabled}
          value={open ? search : shownName}
          onFocus={() => {
            setSearch('');
            setOpen(true);
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setActive((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === 'Enter' && open && options[active]) {
              event.preventDefault();
              choose(options[active]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {!disabled && current ? (
          <button
            type="button"
            aria-label={`Clear ${label}`}
            className="absolute inset-y-0 right-2 text-sm text-ui-fg-muted hover:text-ui-fg-base"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setChosen(null);
              onChange('');
            }}
          >
            ×
          </button>
        ) : null}
        {open && !disabled ? (
          <ul
            id={listId}
            role="listbox"
            aria-label={label}
            className={`${box} absolute z-20 mt-1 max-h-60 w-full overflow-auto py-1 shadow-elevation-flyout`}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={option.value === current}
                className={`cursor-pointer px-2 py-1.5 text-sm ${index === active ? 'bg-ui-bg-base-hover text-ui-fg-base' : 'text-ui-fg-base'}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                {option.label}
              </li>
            ))}
            {options.length === 0 && !failure ? (
              <li className="px-2 py-1.5 text-sm text-ui-fg-muted">
                {search.trim() ? `No ${label} matches “${search.trim()}”.` : `No ${label} records yet.`}
                {!search.trim() && !target && resolverKey && MASTER_HOMES[resolverKey] ? (
                  <>
                    {' '}
                    <a className="text-ui-fg-interactive hover:underline" href={MASTER_HOMES[resolverKey]!.href}>
                      Add them in {MASTER_HOMES[resolverKey]!.label}
                    </a>
                    .
                  </>
                ) : null}
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {failure ? <p className="text-xs text-ui-fg-error">{failure}</p> : null}
      {(canAdd || canOpen) && environment && target && (
        <div className="flex flex-wrap gap-3 text-xs">
          {canAdd && (
            <button
              type="button"
              className="font-medium text-ui-fg-interactive hover:underline"
              onClick={() =>
                environment.open({
                  kind: 'create',
                  target,
                  label,
                  onCreated: (created) => {
                    setChosen(null);
                    onChange(created);
                  },
                })
              }
            >
              + Add new {label}
            </button>
          )}
          {canOpen && (
            <button type="button" className="text-ui-fg-interactive hover:underline" onClick={() => environment.open({ kind: 'open', target, label, id: String(value) })}>
              Open
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RecordDetail({ model, client, permissions, id, onBack }: { model: WindowModel; client: RecordClient; permissions: readonly string[]; id: string; onBack: () => void }) {
  const entityKey = model.rootTab.targetEntityKey;
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; record: RecordValues } | { status: 'failed'; message: string }>({ status: 'loading' });
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [activeChild, setActiveChild] = useState(model.childTabs[0]?.tabKey);
  const [activeRecordTab, setActiveRecordTab] = useState(model.rootTab.tabKey);
  const environment = useContext(Environment);
  const registry = environment?.panels ?? {};
  // WI-OI-120l: while the record is reread after a child change, its actions wait, so they never carry the version
  // from before that change (which answered "someone else changed this record" to the person who made it).
  const [refreshing, setRefreshing] = useState(false);
  // WI-OI-120g: reread the record quietly, so its version and status stay current for its actions (child changes) and
  // its fields show what a panel changed (WI-OI-120ce).
  const reread = useCallback(() => {
    setRefreshing(true);
    client
      .get(entityKey, id)
      .then((fresh) => setState({ status: 'ready', record: fresh }), () => undefined)
      .finally(() => setRefreshing(false));
  }, [client, entityKey, id]);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      setState({ status: 'ready', record: await client.get(entityKey, id) });
    } catch (error) {
      setState({ status: 'failed', message: failureOf(error).message });
    }
  }, [client, entityKey, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // WI-OI-163: the record's action offers, reread whenever its version moves. Without them (an older module, or the
  // call failing) the actions show as before; the command re-checks everything either way.
  const [offers, setOffers] = useState<readonly RecordActionOffer[] | null>(null);
  const offersVersion = state.status === 'ready' ? String(state.record.version ?? '') : '';
  useEffect(() => {
    if (!client.offers || !offersVersion) return;
    let current = true;
    client.offers(entityKey, id).then(
      (answer) => current && setOffers(answer.actions),
      () => current && setOffers(null),
    );
    return () => {
      current = false;
    };
  }, [client, entityKey, id, offersVersion]);

  if (state.status === 'loading') return <p className="text-sm text-ui-fg-muted">Loading…</p>;
  if (state.status === 'failed') {
    return <Notice tone="error" title="Could not open the record" text={state.message} action={<button type="button" className={button} onClick={onBack}>Back to the list</button>} />;
  }
  const record = state.record;
  const fields = placedFields(model, model.rootTab, record, permissions, 'READ');
  const canEdit = placedFields(model, model.rootTab, record, permissions, 'EDIT').some((placed) => !placed.readOnly);
  // WI-OI-163: only the actions offered now; `blocked` says why the others the person would have are not possible.
  const { actions, blocked } = offeredActions(recordActions(model, entityKey, record, permissions), offers, entityKey);
  const child = model.childTabs.find((tab) => tab.tabKey === activeChild);
  const recordTab = model.recordTabs.find((tab) => tab.tabKey === activeRecordTab) ?? model.rootTab;
  const renderPanel = (panel: PlacedPanel) => (
    <MetadataPanel panel={panel} registry={registry} record={record} client={client} permissions={permissions} refresh={reread} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button type="button" className="text-sm text-ui-fg-interactive hover:underline" onClick={onBack}>
            ← {model.view.label}
          </button>
          <h2 className="text-base font-semibold text-ui-fg-base">{recordTitle(model, record)}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && !editing && (
            <button type="button" className={button} disabled={refreshing} onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {!editing &&
            actions.map((action) => (
              <ActionButton
                key={action.actionKey}
                action={action}
                model={model}
                client={client}
                waiting={refreshing}
                run={async (parameters) => {
                  // WI-OI-120g: the action carries the version the user read, so a stale screen cannot act.
                  const read = typeof record.version === 'number' ? { expectedVersion: record.version } : {};
                  const result = await client.action(entityKey, String(record.id), actionKey(action, entityKey), { ...parameters, ...read }, newKey());
                  setState({ status: 'ready', record: { ...record, ...result } });
                  setNotice({ tone: 'info', text: `${action.label}: done.` });
                  environment?.changed?.();
                }}
                onFailure={(message) => setNotice({ tone: 'error', text: message })}
              />
            ))}
        </div>
      </div>
      {notice && <Notice tone={notice.tone} title={notice.tone === 'error' ? 'Not done' : 'Done'} text={notice.text} />}
      {!editing && blocked.length > 0 && (
        <ul className="space-y-1 text-sm text-ui-fg-subtle" aria-label="Actions not possible now">
          {blocked.map((item) => (
            <li key={item.label}>
              <span className="font-medium text-ui-fg-base">{item.label}:</span> {item.message}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <RecordForm
          model={model}
          tab={model.rootTab}
          client={client}
          permissions={permissions}
          record={record}
          onCancel={() => setEditing(false)}
          onSaved={(saved) => {
            setEditing(false);
            setState({ status: 'ready', record: saved });
            setNotice({ tone: 'info', text: 'Saved.' });
          }}
        />
      ) : (
        <div className="space-y-3">
          {model.recordTabs.length > 1 && (
            <div role="tablist" className="flex gap-1 border-b border-ui-border-base">
              {model.recordTabs.map((tab) => (
                <button
                  key={tab.tabKey}
                  type="button"
                  role="tab"
                  aria-selected={tab.tabKey === recordTab.tabKey}
                  className={`px-3 py-2 text-sm ${tab.tabKey === recordTab.tabKey ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle'}`}
                  onClick={() => setActiveRecordTab(tab.tabKey)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <div className={`${box} p-4`}>
            {recordTab === model.rootTab ? (
              <FieldSections
                tab={model.rootTab}
                fields={fields}
                values={record}
                errors={{}}
                client={client}
                panels={placedPanels(model.rootTab, record, permissions)}
                panelSlot={renderPanel}
              />
            ) : (
              <MetadataPanels panels={placedPanels(recordTab, record, permissions)} registry={registry} record={record} client={client} permissions={permissions} refresh={reread} />
            )}
          </div>
        </div>
      )}
      {model.childTabs.length > 0 && (
        <div className="space-y-3">
          <div role="tablist" className="flex gap-1 border-b border-ui-border-base">
            {model.childTabs.map((tab) => (
              <button
                key={tab.tabKey}
                type="button"
                role="tab"
                aria-selected={tab.tabKey === activeChild}
                className={`px-3 py-2 text-sm ${tab.tabKey === activeChild ? 'border-b-2 border-ui-border-interactive font-medium text-ui-fg-base' : 'text-ui-fg-subtle'}`}
                onClick={() => setActiveChild(tab.tabKey)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {child && (
            <ChildTab
              key={child.tabKey}
              model={model}
              tab={child}
              client={client}
              permissions={permissions}
              parentId={String(record.id)}
              onChanged={reread}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  model,
  client,
  run,
  onFailure,
  waiting = false,
}: {
  action: DictionaryActionV1;
  /** WI-OI-149 (QA-022): the window, so a parameter that names a reference is offered as a picker. */
  model: WindowModel;
  client: RecordClient;
  run: (parameters: RecordValues) => Promise<void>;
  onFailure: (message: string) => void;
  /** The record is being reread; the action waits for the current version. */
  waiting?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const parameters = action.parameters ?? [];
  const go = async (input: RecordValues) => {
    setBusy(true);
    try {
      await run(input);
      setAsking(false);
      setValues({});
    } catch (error) {
      onFailure(failureOf(error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!asking) {
    return (
      <button
        type="button"
        className={primary}
        disabled={busy || waiting}
        onClick={() => {
          // WI-OI-120g: an action that declares parameters (a reason, say) asks for them before it runs.
          if (parameters.length > 0) return setAsking(true);
          if (action.confirmationPrompt && !globalThis.confirm(action.confirmationPrompt)) return;
          void go({});
        }}
      >
        {busy ? `${action.label}…` : action.label}
      </button>
    );
  }
  const missing = parameters.filter((parameter) => parameter.required && !values[parameter.key]?.trim());
  return (
    <form
      className={`${box} w-full space-y-2 p-3`}
      aria-label={action.label}
      onSubmit={(event) => {
        event.preventDefault();
        if (missing.length === 0) void go(Object.fromEntries(parameters.map((parameter) => [parameter.key, values[parameter.key]?.trim() ?? ''])));
      }}
    >
      {action.confirmationPrompt && <p className="text-sm text-ui-fg-subtle">{action.confirmationPrompt}</p>}
      {parameters.map((parameter) => (
        <label key={parameter.key} className="block space-y-1 text-sm">
          <span className="text-ui-fg-subtle">
            {parameter.label}
            {parameter.required ? ' *' : ''}
          </span>
          {parameterLookup(model, parameter) ? (
            <LookupInput
              id={`${action.actionKey}-${parameter.key}`}
              placed={parameterLookup(model, parameter) as PlacedField}
              value={values[parameter.key] ?? ''}
              disabled={busy}
              client={client}
              onChange={(input) => setValues((current) => ({ ...current, [parameter.key]: input }))}
              onPick={(option) =>
                setValues((current) => {
                  // The pick fills the dialog's other parameters it names (the vendor's name), as a form does.
                  const next = { ...current, [parameter.key]: option.value };
                  for (const [attribute, target] of Object.entries(parameterLookup(model, parameter)?.fills ?? {})) {
                    const filled = option.attributes?.[attribute];
                    if (filled && parameters.some((candidate) => candidate.key === target)) next[target] = filled;
                  }
                  return next;
                })
              }
            />
          ) : parameter.type === 'TEXTAREA' ? (
            <textarea className={inputClass} value={values[parameter.key] ?? ''} onChange={(event) => setValues({ ...values, [parameter.key]: event.target.value })} />
          ) : (
            <input className={inputClass} value={values[parameter.key] ?? ''} onChange={(event) => setValues({ ...values, [parameter.key]: event.target.value })} />
          )}
        </label>
      ))}
      <div className="flex gap-2">
        <button type="submit" className={primary} disabled={busy || waiting || missing.length > 0}>
          {busy ? `${action.label}…` : action.label}
        </button>
        <button type="button" className={button} disabled={busy} onClick={() => setAsking(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ChildTab({
  model,
  tab,
  client,
  permissions,
  parentId,
  onChanged,
}: {
  model: WindowModel;
  tab: DictionaryTabV1;
  client: RecordClient;
  permissions: readonly string[];
  parentId: string;
  /** The parent record may have moved on (a child changes its content, as a price changes its price-list version). */
  onChanged?: () => void;
}) {
  const link = parentField(model, tab);
  const [creating, setCreating] = useState(false);
  const [version, setVersion] = useState(0);
  if (!link) return <Notice tone="error" title="This tab cannot be drawn" text="Its parent relationship is not declared." />;
  return (
    <div className="space-y-3">
      {creating ? (
        <RecordForm
          model={model}
          tab={tab}
          client={client}
          permissions={permissions}
          fixed={{ [link]: parentId }}
          onCancel={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setVersion((current) => current + 1);
            onChanged?.();
          }}
        />
      ) : canCreate(model, tab, permissions) ? (
        <div className="flex justify-end">
          <button type="button" className={button} onClick={() => setCreating(true)}>
            New {tab.label}
          </button>
        </div>
      ) : null}
      <RecordList key={version} model={model} tab={tab} client={client} permissions={permissions} parentId={parentId} />
    </div>
  );
}
