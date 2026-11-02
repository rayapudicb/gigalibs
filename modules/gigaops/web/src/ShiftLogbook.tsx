'use client';

import {
  LOGBOOK_INCOMING_STATEMENT,
  LOGBOOK_OUTGOING_STATEMENT,
  LOGBOOK_SUPERVISOR_STATEMENT,
  type BypassV1,
  type HandoverV1,
  type LogEntryV1,
  type LogbookBoardV1,
  type LogbookV1,
  holdsPermission,
} from '@gigalibs/contracts';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

// WI-OI-137 M-LOG: the shift logbook board. Every rule (immutable entries, four-eyes bypasses, two-person handover
// against the active bypasses) is Workforce's; this screen shows its answers and refusals.

const BASE_PATH = '/api/workforce/v1';
const box = 'rounded-lg border border-ui-border-base bg-ui-bg-base p-4';
const primary =
  'inline-flex items-center gap-1 rounded-md bg-ui-button-inverted px-3 py-1.5 text-sm font-medium text-ui-fg-on-inverted hover:bg-ui-button-inverted-hover disabled:opacity-50';
const secondary =
  'inline-flex items-center gap-1 rounded-md border border-ui-border-base bg-ui-bg-base px-3 py-1.5 text-sm text-ui-fg-base hover:bg-ui-bg-base-hover disabled:opacity-50';
const inputClass =
  'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-2 py-1.5 text-sm text-ui-fg-base focus:border-ui-border-interactive focus:outline-none';
const CATEGORIES = ['NOTE', 'EQUIPMENT_STATE', 'TRIP', 'CHEMICAL_DOSE', 'STANDING_ALARM', 'FEEDSTOCK_CHANGE', 'SAFETY'] as const;
const label = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replaceAll('_', ' ');
const when = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`${BASE_PATH}${path}`, {
    method: init.method ?? 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json', ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const body = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    const nested = body.message && typeof body.message === 'object' ? (body.message as Record<string, unknown>) : body;
    throw new Error(typeof nested.message === 'string' ? nested.message : `Workforce request failed (${response.status}).`);
  }
  return payload as T;
}

export function ShiftLogbook({ permissions = [] }: { permissions?: readonly string[] }) {
  const can = useCallback((permission: string) => holdsPermission(permissions, permission), [permissions]);
  const [logbooks, setLogbooks] = useState<readonly LogbookV1[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'register'>('board');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    call<{ items: LogbookV1[] }>('/logbooks').then((page) => {
      setLogbooks(page.items);
      setOpen((current) => current ?? page.items[0]?.id ?? null);
    }, (failure: Error) => setError(failure.message));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={view === 'board' ? primary : secondary} aria-pressed={view === 'board'} onClick={() => setView('board')}>Logbook</button>
        <button type="button" className={view === 'register' ? primary : secondary} aria-pressed={view === 'register'} onClick={() => setView('register')}>Bypass register</button>
        {view === 'board' && logbooks && logbooks.length > 0 ? (
          <select aria-label="Logbook" className={`${inputClass} w-64`} value={open ?? ''} onChange={(event) => setOpen(event.target.value)}>
            {logbooks.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
          </select>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-ui-fg-error">{error}</p> : null}
      {!logbooks && !error ? <p className="text-sm text-ui-fg-subtle">Loading logbooks…</p> : null}
      {view === 'register' ? <BypassRegister /> : null}
      {view === 'board' && logbooks && logbooks.length === 0 ? <p className="text-sm text-ui-fg-subtle">No logbooks yet.</p> : null}
      {view === 'board' && open ? <Board key={open} logbookId={open} can={can} /> : null}
      {view === 'board' && can('workforce.logbook.manage') ? <CreateLogbook onCreated={load} /> : null}
    </div>
  );
}

function CreateLogbook({ onCreated }: { onCreated: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const shiftWindows = String(form.get('windows')).split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
      const [name, range] = part.split(/\s+(?=\d)/);
      const [start, end] = (range ?? '').split('-');
      return { name: name?.trim() ?? '', start: start?.trim() ?? '', end: end?.trim() ?? '' };
    });
    try {
      await call('/logbooks', { method: 'POST', body: { code: form.get('code'), name: form.get('name'), timeZone: form.get('timeZone'), shiftWindows } });
      setMessage('Logbook created.');
      onCreated();
    } catch (failure) {
      setMessage((failure as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className={`${box} grid grid-cols-1 gap-3 md:grid-cols-4`}>
      <p className="text-sm font-medium text-ui-fg-base md:col-span-4">New logbook</p>
      <label className="space-y-1 text-sm">Code<input name="code" required className={inputClass} /></label>
      <label className="space-y-1 text-sm">Name<input name="name" required className={inputClass} /></label>
      <label className="space-y-1 text-sm">Time zone<input name="timeZone" required defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone} className={inputClass} /></label>
      <label className="space-y-1 text-sm">Shifts<input name="windows" required defaultValue="Day 06:00-18:00, Night 18:00-06:00" className={inputClass} /></label>
      <div className="md:col-span-4"><button type="submit" className={primary}>Create logbook</button></div>
      {message ? <p className="text-sm text-ui-fg-subtle md:col-span-4">{message}</p> : null}
    </form>
  );
}

function Board({ logbookId, can }: { logbookId: string; can: (permission: string) => boolean }) {
  const [board, setBoard] = useState<LogbookBoardV1 | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const reload = useCallback(() => {
    call<LogbookBoardV1>(`/logbooks/${encodeURIComponent(logbookId)}/board`).then(setBoard, (failure: Error) => setMessage(failure.message));
  }, [logbookId]);
  useEffect(reload, [reload]);
  const act = async (work: () => Promise<unknown>, done: string) => {
    setMessage(null);
    try {
      await work();
      setMessage(done);
      reload();
    } catch (failure) {
      setMessage((failure as Error).message);
    }
  };
  if (!board) return <p className="text-sm text-ui-fg-subtle">{message ?? 'Loading the board…'}</p>;
  const writer = can('workforce.logbook.write');
  return (
    <div className="space-y-4">
      <div className={box}>
        <p className="text-sm font-medium text-ui-fg-base">{board.logbook.name} · {board.currentShift.shiftName} shift of {board.currentShift.shiftDate}</p>
        <p className="text-sm text-ui-fg-subtle">{when(board.currentShift.startsAt)} – {when(board.currentShift.endsAt)} ({board.logbook.timeZone})</p>
      </div>
      {message ? <p role="status" className="text-sm text-ui-fg-subtle">{message}</p> : null}
      {writer ? <QuickLog logbookId={logbookId} onSaved={(done) => act(async () => undefined, done)} /> : null}
      <Entries entries={board.entries} />
      <Bypasses board={board} can={can} act={act} />
      <Handover board={board} can={can} act={act} />
    </div>
  );
}

function QuickLog({ logbookId, onSaved }: { logbookId: string; onSaved: (message: string) => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('NOTE');
  const [text, setText] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await call(`/logbooks/${encodeURIComponent(logbookId)}/entries`, { method: 'POST',
        body: { clientOperationId: operationId, category, text: text.trim(), priority, occurredAt: new Date().toISOString() } });
      setText('');
      setOperationId(crypto.randomUUID());
      onSaved('Entry logged.');
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  return (
    <form onSubmit={submit} className={`${box} space-y-3`}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Entry type">
        {CATEGORIES.map((item) => (
          <button key={item} type="button" aria-pressed={category === item} className={category === item ? primary : secondary} onClick={() => setCategory(item)}>{label(item)}</button>
        ))}
      </div>
      <label className="space-y-1 text-sm">What happened<textarea required maxLength={2000} value={text} onChange={(event) => setText(event.target.value)} className={inputClass} /></label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">Priority
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className={inputClass}>
            <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option>
          </select>
        </label>
        <button type="submit" className={primary} disabled={!text.trim()}>Log entry</button>
      </div>
      {error ? <p role="alert" className="text-sm text-ui-fg-error">{error}</p> : null}
    </form>
  );
}

function Entries({ entries }: { entries: readonly LogEntryV1[] }) {
  return (
    <div className={box}>
      <p className="text-sm font-medium text-ui-fg-base">Log (this and the previous shift)</p>
      {entries.length === 0 ? <p className="text-sm text-ui-fg-subtle">Nothing logged yet.</p> : (
        <ul className="mt-2 space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="font-medium text-ui-fg-base">{when(entry.occurredAt)} · {label(entry.category)}{entry.priority === 'HIGH' ? ' · high' : ''}</span>
              <span className="text-ui-fg-subtle"> · {entry.author} · {entry.shiftName} {entry.shiftDate}</span>
              <p className={entry.correctedByEntryId ? 'text-ui-fg-subtle line-through' : 'text-ui-fg-base'}>{entry.text}</p>
              {entry.correctsEntryId ? <p className="text-ui-fg-subtle">Correction of an earlier entry.</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Bypasses({ board, can, act }: { board: LogbookBoardV1; can: (permission: string) => boolean; act: (work: () => Promise<unknown>, done: string) => void }) {
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  async function request(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const target = event.currentTarget;
    act(async () => {
      await call(`/logbooks/${encodeURIComponent(board.logbook.id)}/bypasses`, { method: 'POST', body: {
        clientOperationId: operationId, description: form.get('description'), reason: form.get('reason'), mitigation: form.get('mitigation'),
        plannedRemovalAt: new Date(String(form.get('plannedRemovalAt'))).toISOString() } });
      target.reset();
      setOperationId(crypto.randomUUID());
    }, 'Bypass requested; a supervisor authorizes it.');
  }
  const decide = (bypass: BypassV1, decision: 'AUTHORIZE' | 'REJECT') => {
    const note = decision === 'REJECT' ? window.prompt('Why is this bypass rejected?')?.trim() : undefined;
    if (decision === 'REJECT' && !note) return;
    act(() => call(`/logbook-bypasses/${bypass.id}/decision`, { method: 'POST', body: { decision, expectedVersion: bypass.version, ...(note ? { note } : {}) } }),
      decision === 'AUTHORIZE' ? 'Bypass authorized.' : 'Bypass rejected.');
  };
  return (
    <div className={`${box} space-y-3`}>
      <p className="text-sm font-medium text-ui-fg-base">Safety bypasses</p>
      {board.activeBypasses.length === 0 ? <p className="text-sm text-ui-fg-subtle">No active bypass.</p> : board.activeBypasses.map((bypass) => (
        <div key={bypass.id} className="text-sm">
          <p className={bypass.overdue ? 'font-medium text-ui-fg-error' : 'font-medium text-ui-fg-base'}>
            {bypass.description} · active {bypass.activeHours} h{bypass.overdue ? ' · overdue' : ''}
          </p>
          <p className="text-ui-fg-subtle">Authorized by {bypass.authorizedBy} · planned removal {when(bypass.plannedRemovalAt)} · {bypass.mitigation}</p>
          {can('workforce.logbook.write') ? (
            <button type="button" className={secondary} onClick={() => act(() => call(`/logbook-bypasses/${bypass.id}/clear`, { method: 'POST', body: { expectedVersion: bypass.version } }), 'Bypass cleared.')}>
              Clear (protection restored)
            </button>
          ) : null}
        </div>
      ))}
      {board.pendingBypasses.map((bypass) => (
        <div key={bypass.id} className="text-sm">
          <p className="font-medium text-ui-fg-base">Awaiting authorization: {bypass.description}</p>
          <p className="text-ui-fg-subtle">Requested by {bypass.requestedBy} · {bypass.reason} · mitigation: {bypass.mitigation}</p>
          {can('workforce.logbook.authorize') ? (
            <div className="mt-1 flex gap-2">
              <button type="button" className={primary} onClick={() => decide(bypass, 'AUTHORIZE')}>Authorize</button>
              <button type="button" className={secondary} onClick={() => decide(bypass, 'REJECT')}>Reject</button>
            </div>
          ) : null}
        </div>
      ))}
      {can('workforce.logbook.write') ? (
        <form onSubmit={request} className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="space-y-1 text-sm">What is bypassed<input name="description" required maxLength={500} className={inputClass} /></label>
          <label className="space-y-1 text-sm">Planned removal<input name="plannedRemovalAt" type="datetime-local" required className={inputClass} /></label>
          <label className="space-y-1 text-sm">Reason<input name="reason" required maxLength={1000} className={inputClass} /></label>
          <label className="space-y-1 text-sm">Mitigation<input name="mitigation" required maxLength={1000} className={inputClass} /></label>
          <div><button type="submit" className={secondary}>Request bypass</button></div>
        </form>
      ) : null}
    </div>
  );
}

function Handover({ board, can, act }: { board: LogbookBoardV1; can: (permission: string) => boolean; act: (work: () => Promise<unknown>, done: string) => void }) {
  const [notes, setNotes] = useState('');
  const [certified, setCertified] = useState(false);
  const [acknowledged, setAcknowledged] = useState<string[]>([]);
  const [operationId] = useState(() => crypto.randomUUID());
  const open: HandoverV1 | null = board.openHandover;
  const last = board.lastHandover;
  return (
    <div className={`${box} space-y-3`}>
      <p className="text-sm font-medium text-ui-fg-base">Shift handover</p>
      {last ? <p className="text-sm text-ui-fg-subtle">Last: {last.shiftName} {last.shiftDate} · {last.status.toLowerCase()} · {last.outgoingBy} → {last.incomingBy}</p> : null}
      {last && last.status === 'ACCEPTED' && can('workforce.logbook.authorize') ? (
        <button type="button" className={secondary} onClick={() => act(() => call(`/logbook-handovers/${last.id}/countersign`, { method: 'POST',
          body: { expectedVersion: last.version, statement: LOGBOOK_SUPERVISOR_STATEMENT } }), 'Handover countersigned.')}>Countersign last handover</button>
      ) : null}
      {open ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium text-ui-fg-base">Awaiting acceptance: {open.shiftName} {open.shiftDate}, submitted by {open.outgoingBy}</p>
          <p className="text-ui-fg-base">{open.notes}</p>
          <p className="text-ui-fg-subtle">
            Logged: {Object.entries(open.package.entryCounts).map(([key, value]) => `${label(key)} ${value}`).join(' · ') || 'nothing'} ·
            pending bypass requests {open.package.pendingBypasses}
          </p>
          {open.package.highPriorityEntries.map((entry) => <p key={entry.id} className="text-ui-fg-base">High: {entry.text}</p>)}
          {open.package.activeBypasses.map((bypass) => (
            <label key={bypass.id} className="flex items-center gap-2">
              <input type="checkbox" checked={acknowledged.includes(bypass.id)}
                onChange={(event) => setAcknowledged(event.target.checked ? [...acknowledged, bypass.id] : acknowledged.filter((id) => id !== bypass.id))} />
              I know bypass “{bypass.description}” is active (planned removal {when(bypass.plannedRemovalAt)}).
            </label>
          ))}
          {can('workforce.logbook.write') ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary}
                disabled={acknowledged.length !== open.package.activeBypasses.length}
                onClick={() => act(() => call(`/logbook-handovers/${open.id}/accept`, { method: 'POST',
                  body: { expectedVersion: open.version, acknowledgedBypassIds: acknowledged, statement: LOGBOOK_INCOMING_STATEMENT } }), 'Handover accepted.')}>
                Accept custody
              </button>
              <button type="button" className={secondary} onClick={() => act(() => call(`/logbook-handovers/${open.id}/refreeze`, { method: 'POST',
                body: { expectedVersion: open.version } }), 'Package refreshed.')}>Refresh package (outgoing operator)</button>
            </div>
          ) : null}
          <p className="text-ui-fg-subtle">Accepting: “{LOGBOOK_INCOMING_STATEMENT}”</p>
        </div>
      ) : can('workforce.logbook.write') ? (
        <div className="space-y-2">
          <label className="space-y-1 text-sm">Turnover notes<textarea maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={certified} onChange={(event) => setCertified(event.target.checked)} />{LOGBOOK_OUTGOING_STATEMENT}
          </label>
          <button type="button" className={primary} disabled={!certified || !notes.trim()}
            onClick={() => act(() => call(`/logbooks/${board.logbook.id}/handovers`, { method: 'POST', body: {
              clientOperationId: operationId, shiftDate: board.currentShift.shiftDate, shiftName: board.currentShift.shiftName,
              notes: notes.trim(), statement: LOGBOOK_OUTGOING_STATEMENT } }), 'Handover submitted; the incoming operator accepts it.')}>
            Submit handover for this shift
          </button>
        </div>
      ) : null}
    </div>
  );
}

function BypassRegister() {
  const [items, setItems] = useState<readonly BypassV1[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call<{ items: BypassV1[] }>('/logbook-bypasses').then((page) => setItems(page.items), (failure: Error) => setError(failure.message));
  }, []);
  if (error) return <p role="alert" className="text-sm text-ui-fg-error">{error}</p>;
  if (!items) return <p className="text-sm text-ui-fg-subtle">Loading the register…</p>;
  return (
    <div className={box}>
      <p className="text-sm font-medium text-ui-fg-base">Open bypasses across your logbooks</p>
      {items.length === 0 ? <p className="text-sm text-ui-fg-subtle">None.</p> : (
        <ul className="mt-2 space-y-2">
          {items.map((bypass) => (
            <li key={bypass.id} className="text-sm">
              <span className={bypass.overdue ? 'font-medium text-ui-fg-error' : 'font-medium text-ui-fg-base'}>{bypass.description}</span>
              <span className="text-ui-fg-subtle"> · {bypass.status.toLowerCase()}{bypass.activeHours !== null ? ` · ${bypass.activeHours} h` : ''}{bypass.overdue ? ' · overdue' : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
