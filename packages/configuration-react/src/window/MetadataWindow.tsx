import type { CompiledDictionaryManifestV1, DictionaryActionV1, DictionaryTabV1 } from '@gigalibs/contracts';
import { createContext, type FormEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type LookupOption, type RecordClient, RecordClientError, type RecordPage, type RecordValues } from './record-client.js';
import { usePublishedManifest } from './use-published-manifest.js';
import {
  actionKey,
  describeFailure,
  holds,
  gridColumns,
  inputFromValue,
  type PlacedField,
  parentField,
  placedFields,
  recordActions,
  recordTitle,
  validateValues,
  valueFromInput,
  type WindowModel,
  windowModel,
  writableValues,
} from './window-model.js';

// WI-OI-120f (F0.4, ADR-0033 D1): one window for every module, drawn only from the published manifest. Rows come from
// the module's record dispatcher; buttons call its registered commands. The window holds no business data of its own,
// denies by default (fields and actions a user may not use are not shown), and shows every state: loading, empty,
// refused, not found, changed by someone else, unavailable. Styling uses the design standard's ui-* tokens only.

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
  readonly open: (dialog: QuickDialog) => void;
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

export function MetadataWindow({ manifest, client, permissions, viewKey, clients }: MetadataWindowProps) {
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
        open: (dialog) => setDialogs((current) => [...current, dialog]),
      },
    [outer, clients, ownModule, client, permissions],
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

function RecordList({
  model,
  client,
  permissions,
  onOpen,
  onNew,
  tab = model.rootTab,
  parentId,
}: {
  model: WindowModel;
  client: RecordClient;
  permissions: readonly string[];
  onOpen?: ((id: string) => void) | undefined;
  onNew?: (() => void) | undefined;
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

  return (
    <div className="space-y-3">
      {isRoot && (
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-ui-fg-base">{view.label}</h2>
          <div className="flex items-center gap-2">
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
        <Notice tone="info" title="No records yet" text={onNew ? 'Use New to create the first one.' : 'Nothing has been recorded here yet.'} />
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
                        {field.label} {query.sort === field.fieldKey ? (query.direction === 'ASC' ? '↑' : '↓') : ''}
                      </button>
                    ) : (
                      field.label
                    )}
                  </th>
                ))}
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
  const [values, setValues] = useState<Record<string, unknown>>({ ...(record ?? {}), ...fixed });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // One key per form: a retry after a network failure replays the first answer instead of saving twice.
  const [idempotencyKey] = useState(newKey);
  const fields = placedFields(model, tab, values, permissions, record ? 'EDIT' : 'CREATE').filter((placed) => !(placed.field.fieldKey in fixed));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = validateValues(model, fields, values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFailure(null);
    try {
      const saved = record
        ? await client.update(tab.targetEntityKey, String(record.id), writableValues(fields, values, record), Number(record.version))
        : await client.create(tab.targetEntityKey, { ...writableValues(fields, values), ...fixed }, idempotencyKey);
      onSaved(saved);
    } catch (error) {
      setFailure(failureOf(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`${box} space-y-4 p-4`} onSubmit={(event) => void submit(event)} noValidate>
      <h3 className="text-sm font-semibold text-ui-fg-base">{record ? `Edit ${tab.label}` : `New ${tab.label}`}</h3>
      {failure && <Notice tone="error" title="Not saved" text={failure} />}
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
}: {
  tab: DictionaryTabV1;
  fields: readonly PlacedField[];
  values: RecordValues;
  errors: Readonly<Record<string, string>>;
  client: RecordClient;
  onChange?: (fieldKey: string, value: unknown) => void;
}) {
  const sections = [...tab.sections].sort((a, b) => a.position - b.position);
  const groups = sections.length > 0 ? sections.map((section) => ({ key: section.sectionKey, label: section.label, fields: fields.filter((placed) => placed.placement.sectionKey === section.sectionKey) })) : [];
  const loose = fields.filter((placed) => !placed.placement.sectionKey || !sections.some((section) => section.sectionKey === placed.placement.sectionKey));
  return (
    <div className="space-y-4">
      {[...groups, ...(loose.length > 0 ? [{ key: '_', label: '', fields: loose }] : [])].map((group) =>
        group.fields.length === 0 ? null : (
          <fieldset key={group.key} className="space-y-3">
            {group.label ? <legend className="text-xs font-medium uppercase text-ui-fg-muted">{group.label}</legend> : null}
            <div className="grid grid-cols-12 gap-3">
              {group.fields.map((placed) => (
                <div key={placed.field.fieldKey} className="col-span-12 space-y-1" style={{ gridColumn: `span ${placed.placement.span} / span ${placed.placement.span}` }}>
                  <FieldInput placed={placed} value={values[placed.field.fieldKey]} error={errors[placed.field.fieldKey]} client={client} onChange={onChange} />
                </div>
              ))}
            </div>
          </fieldset>
        ),
      )}
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
  const set = (input: string | boolean) => onChange?.(field.fieldKey, valueFromInput(field, input));
  const label = (
    <label htmlFor={id} className="text-xs font-medium text-ui-fg-subtle">
      {field.label}
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
    control = <LookupInput id={id} placed={placed} value={value} disabled={disabled} client={client} onChange={set} />;
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

function LookupInput({
  id,
  placed,
  value,
  disabled,
  client,
  onChange,
}: {
  id: string;
  placed: PlacedField;
  value: unknown;
  disabled: boolean;
  client: RecordClient;
  onChange: (input: string) => void;
}) {
  const resolverKey = placed.resolverKey;
  const [options, setOptions] = useState<readonly LookupOption[]>([]);
  const [search, setSearch] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    if (!resolverKey) return;
    let active = true;
    const current = typeof value === 'string' && value ? [value] : [];
    client
      .lookup(resolverKey, search ? { search } : current.length > 0 ? { ids: current } : {})
      .then((found) => {
        if (active) {
          setOptions(found);
          setFailure(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setFailure(failureOf(error).message);
      });
    return () => {
      active = false;
    };
  }, [client, resolverKey, search, value]);
  const environment = useContext(Environment);
  const target = placed.createWith;
  const targetClient = target ? environment?.clients[target.moduleKey] : undefined;
  const label = placed.field.label;
  const canAdd = Boolean(!disabled && target && targetClient && environment && holds(environment.permissions, target.permission));
  const canOpen = Boolean(target && targetClient && typeof value === 'string' && value);
  if (!resolverKey) return <p className="text-xs text-ui-fg-error">This field has no lookup.</p>;
  return (
    <div className="space-y-1">
      {!disabled && <input aria-label={`Search ${placed.field.label}`} className={inputClass} placeholder="Type to search" value={search} onChange={(event) => setSearch(event.target.value)} />}
      <select id={id} className={inputClass} value={value === null || value === undefined ? '' : String(value)} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {failure ? <p className="text-xs text-ui-fg-error">{failure}</p> : null}
      {!disabled && !failure && options.length === 0 && (
        <p className="text-xs text-ui-fg-muted">{search ? `No ${label} matches “${search}”.` : `No ${label} records yet.`}</p>
      )}
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
                    setSearch('');
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
  // WI-OI-120l: while the record is reread after a child change, its actions wait, so they never carry the version
  // from before that change (which answered "someone else changed this record" to the person who made it).
  const [refreshing, setRefreshing] = useState(false);

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

  if (state.status === 'loading') return <p className="text-sm text-ui-fg-muted">Loading…</p>;
  if (state.status === 'failed') {
    return <Notice tone="error" title="Could not open the record" text={state.message} action={<button type="button" className={button} onClick={onBack}>Back to the list</button>} />;
  }
  const record = state.record;
  const fields = placedFields(model, model.rootTab, record, permissions, 'READ');
  const canEdit = placedFields(model, model.rootTab, record, permissions, 'EDIT').some((placed) => !placed.readOnly);
  const actions = recordActions(model, entityKey, record, permissions);
  const child = model.childTabs.find((tab) => tab.tabKey === activeChild);

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
                waiting={refreshing}
                run={async (parameters) => {
                  // WI-OI-120g: the action carries the version the user read, so a stale screen cannot act.
                  const read = typeof record.version === 'number' ? { expectedVersion: record.version } : {};
                  const result = await client.action(entityKey, String(record.id), actionKey(action, entityKey), { ...parameters, ...read }, newKey());
                  setState({ status: 'ready', record: { ...record, ...result } });
                  setNotice({ tone: 'info', text: `${action.label}: done.` });
                }}
                onFailure={(message) => setNotice({ tone: 'error', text: message })}
              />
            ))}
        </div>
      </div>
      {notice && <Notice tone={notice.tone} title={notice.tone === 'error' ? 'Not done' : 'Done'} text={notice.text} />}
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
        <div className={`${box} p-4`}>
          <FieldSections tab={model.rootTab} fields={fields} values={record} errors={{}} client={client} />
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
              onChanged={() => {
                // WI-OI-120g: reread the parent quietly, so its version and status stay current for its actions.
                setRefreshing(true);
                client
                  .get(entityKey, String(record.id))
                  .then((fresh) => setState({ status: 'ready', record: fresh }), () => undefined)
                  .finally(() => setRefreshing(false));
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  action,
  run,
  onFailure,
  waiting = false,
}: {
  action: DictionaryActionV1;
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
          {parameter.type === 'TEXTAREA' ? (
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
