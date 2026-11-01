'use client';

import type { RoundCheckpointDraftV1, RoundScheduleV1 } from '@gigalibs/contracts';
import { Alert, Button, Container, Heading, Input, Label, Text } from '@medusajs/ui';
import { type DragEvent, type FormEvent, useCallback, useEffect, useState } from 'react';
import { checkpointBatches } from './checkpoint-batches';
import {
  assetSource, lookupSource, meterSource, operatorSource, ReferencePicker,
} from './reference-pickers';
import { availableRoundsTabs, canUseRoundsPermission, type RoundsWorkspaceTab } from './rounds-navigation';
import { RouteJourneyPreview } from './route-journey-preview';
import { reorderRoundCheckpoints } from './route-order';
import { RoundsScheduleControl } from './rounds-schedule-control';
import { RoundInspectionTrend } from './round-inspection-trend';

const BASE = '/api/operator-rounds/v1';
type RouteState = 'DRAFT' | 'PUBLISHED' | 'RETIRED';
interface Route {
  id:string; code:string; title:string; description:string|null; revision:number;
  state:RouteState; owningUnitId:string|null; placeRef:string|null;
  schedule:RoundScheduleV1; version:number; checkpoints?:RoundCheckpointDraftV1[];
}
interface BoardItem {
  id:string; routeCode:string; routeTitle:string; operatorSubject:string;
  scheduledStart:string; dueAt:string; state:string; checkpointCount:number;
  readingCount:number; exceptionCount:number; overdue?:boolean;
  skips?:{requested:number;approved:number;rejected:number};
}
interface ExceptionItem {
  id:string; origin?:'READING'|'DEFECT'; description?:string|null; reportedBy?:string|null;
  routeCode:string; checkpointLabel:string; assetRef:string;
  severity:string; state:string; version:number; reviewNote:string|null;
  cmmsWorkOrderRef:string|null; refusalCode:string|null; createdAt:string;
}
interface SkipItem {
  id:string; routeCode:string; checkpointLabel:string; assetRef:string; reasonCode:string; note:string|null;
  requestedBy:string; capturedAt:string; state:'REQUESTED'|'APPROVED'|'REJECTED'; decidedBy:string|null;
  decisionNote:string|null; version:number;
}
const SKIP_REASONS:Record<string,string> = {INACCESSIBLE:'Inaccessible',UNSAFE:'Unsafe to approach',
  ASSET_OUT_OF_SERVICE:'Asset out of service',TAG_DAMAGED:'Tag damaged or missing',OTHER:'Other'};
interface RosterEntry { workforceResourceRef:string;operatorSubject:string }
interface Roster { version:number;entries:RosterEntry[];updatedBy:string|null;updatedAt:string|null }
interface GenerationResult { localDate:string;scheduledStart:string|null;dueAt:string|null;
  items:(RosterEntry & {status:'ASSIGNED'|'FAILED';assignmentId?:string;replayed?:boolean;
    scheduledStart?:string;dueAt?:string;code?:string;retryable?:boolean})[] }

async function call<T>(path:string,init:RequestInit = {}):Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept','application/json');
  if (init.body) headers.set('Content-Type','application/json');
  const response = await fetch(`${BASE}${path}`,{...init,headers,cache:'no-store'});
  if (response.status === 401) window.location.assign('/login');
  const body:unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const value = body && typeof body === 'object' ? body as Record<string,unknown> : {};
    throw new Error(typeof value.message === 'string' ? value.message :
      typeof value.title === 'string' ? value.title : `Request failed (${response.status}).`);
  }
  return body as T;
}
const json = (value:unknown) => JSON.stringify(value);
const unitLookup = lookupSource('organization-units');
const placeLookup = lookupSource('workspace-sites');
const text = (value:string|null|undefined) => value ?? '';
const nullable = (value:string) => value.trim() || null;
const datetime = (value:string) => value ? new Date(value).toLocaleString() : '—';
const blankPoint = (position:number):RoundCheckpointDraftV1 => ({
  position,label:'',assetRef:'',meterRef:null,tagCode:'',proofMode:'EITHER',
  readingKind:'BOOLEAN',unitCode:null,nominal:null,amberLow:null,amberHigh:null,
  redLow:null,redHigh:null,choices:[],branchRules:[],instructions:null,photoOnException:true,
});

export function RoundsWorkspace({permissions = []}:{readonly permissions?:readonly string[]}) {
  const can = (permission:string) => canUseRoundsPermission(permissions,permission);
  const visibleTabs = availableRoundsTabs(permissions);
  const [routes,setRoutes] = useState<Route[]>([]);
  const [selected,setSelected] = useState<Route|null>(null);
  const [points,setPoints] = useState<RoundCheckpointDraftV1[]>([]);
  const [board,setBoard] = useState<BoardItem[]>([]);
  const [exceptions,setExceptions] = useState<ExceptionItem[]>([]);
  const [skips,setSkips] = useState<SkipItem[]>([]);
  const [skipAction,setSkipAction] = useState<{id:string;decision:'APPROVED'|'REJECTED'}|null>(null);
  const [skipNote,setSkipNote] = useState('');
  const [tab,setTab] = useState<RoundsWorkspaceTab>(visibleTabs[0] ?? 'routes');
  const activeTab = visibleTabs.includes(tab) ? tab : visibleTabs[0] ?? null;
  const [error,setError] = useState<string|null>(null);
  const [notice,setNotice] = useState<string|null>(null);
  const [busy,setBusy] = useState(false);
  const [newCode,setNewCode] = useState('');
  const [newTitle,setNewTitle] = useState('');
  const [unit,setUnit] = useState('');
  const [place,setPlace] = useState('');
  const [cadence,setCadence] = useState<RoundScheduleV1['cadence']>('DAILY');
  const [timeZone,setTimeZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [localTime,setLocalTime] = useState('08:00');
  const [weekdays,setWeekdays] = useState('1,2,3,4,5');
  const [grace,setGrace] = useState(30);
  const [windowMinutes,setWindowMinutes] = useState(60);
  const [roster,setRoster] = useState<Roster>({version:0,entries:[],updatedBy:null,updatedAt:null});
  const [rosterDirty,setRosterDirty] = useState(false);
  const [rosterSubject,setRosterSubject] = useState('');
  const [rosterResource,setRosterResource] = useState('');
  const [generationDate,setGenerationDate] = useState(new Date().toISOString().slice(0,10));
  const [generationResult,setGenerationResult] = useState<GenerationResult|null>(null);
  const [assignmentSubject,setAssignmentSubject] = useState('');
  const [workforceResource,setWorkforceResource] = useState('');
  const [assignmentStart,setAssignmentStart] = useState('');
  const [assignmentDue,setAssignmentDue] = useState('');
  const [dragged,setDragged] = useState<number|null>(null);
  const [publishReview,setPublishReview] = useState(false);
  const [exceptionAction,setExceptionAction] = useState<{id:string;kind:'ACKNOWLEDGED'|'RESOLVED'|'RETRY'}|null>(null);
  const [exceptionNote,setExceptionNote] = useState('');

  const load = useCallback(async () => {
    const [r,b,e,k] = await Promise.all([
      can('operator-rounds.routes.read') ? call<{items:Route[]}>('/routes') : Promise.resolve({items:[]}),
      can('operator-rounds.board.read') ? call<{items:BoardItem[]}>('/assignments/board') : Promise.resolve({items:[]}),
      can('operator-rounds.exceptions.read') ? call<{items:ExceptionItem[]}>('/exceptions') : Promise.resolve({items:[]}),
      can('operator-rounds.skips.approve') ? call<{items:SkipItem[]}>('/skips') : Promise.resolve({items:[]}),
    ]);
    setRoutes(r.items); setBoard(b.items); setExceptions(e.items); setSkips(k.items);
  // permissions are fixed by the server-rendered session for this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  useEffect(() => {
    void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Rounds could not be loaded.'));
    const timer = window.setInterval(() => {
      void load().catch(() => undefined);
    },15_000);
    return () => window.clearInterval(timer);
  },[load]);

  const open = useCallback(async (id:string) => {
    const [route,rosterResult] = await Promise.all([
      call<Route>(`/routes/${encodeURIComponent(id)}`),
      can('operator-rounds.assignments.manage') ? call<Roster>(`/routes/${encodeURIComponent(id)}/roster`)
        :Promise.resolve({version:0,entries:[],updatedBy:null,updatedAt:null}),
    ]);
    setSelected(route);setPoints(route.checkpoints ?? []);setPublishReview(false);
    setRoster(rosterResult);setRosterDirty(false);setGenerationResult(null);
    setNewTitle(route.title);setUnit(text(route.owningUnitId));setPlace(text(route.placeRef));
    setCadence(route.schedule.cadence);setTimeZone(route.schedule.timeZone);
    setLocalTime(route.schedule.localTime ?? '08:00');
    setWeekdays((route.schedule.weekdays ?? [1,2,3,4,5]).join(','));
    setGrace(route.schedule.graceMinutes);setWindowMinutes(route.schedule.windowMinutes);setError(null);
  },[]);

  async function action(work:() => Promise<void>) {
    setBusy(true);setError(null);setNotice(null);
    try {await work();await load();}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'The action could not be completed.');}
    finally {setBusy(false);}
  }

  function schedule():RoundScheduleV1 {
    const value:RoundScheduleV1 = {cadence,timeZone,graceMinutes:grace,windowMinutes,
      ...(cadence === 'PER_SHIFT' ? {} : {localTime}),
      ...(cadence === 'WEEKLY' ? {weekdays:weekdays.split(',').map((day) => Number(day.trim()))} : {}),
    };
    return value;
  }
  async function create(event:FormEvent) {
    event.preventDefault();
    await action(async () => {
      const route = await call<Route>('/routes',{method:'POST',body:json({requestKey:crypto.randomUUID(),
        code:newCode.trim().toUpperCase(),title:newTitle.trim(),description:null,
        owningUnitId:nullable(unit),placeRef:nullable(place),schedule:schedule()})});
      setNewCode('');setNotice('Draft route created. Add checkpoints and ask another authorized person to publish.');
      await open(route.id);
    });
  }
  async function saveRoute() {
    if (!selected) return;
    await action(async () => {
      await call(`/routes/${selected.id}`,{method:'PATCH',body:json({version:selected.version,
        title:newTitle.trim(),owningUnitId:nullable(unit),placeRef:nullable(place),schedule:schedule()})});
      await open(selected.id);setNotice('Draft settings saved.');
    });
  }
  async function savePoints() {
    if (!selected) return;
    await action(async () => {
      // Bounded batches, then one atomic finalize: a 1,000-checkpoint draft never sends one oversized request, and the
      // saved checkpoints change only when every batch arrived.
      const ordered = points.map((point,index) => ({...point,position:index+1}));
      const batches = checkpointBatches(ordered);
      const uploadId = crypto.randomUUID();
      for (const [batchIndex,checkpoints] of batches.entries()) {
        if (batches.length > 1) setNotice(`Saving checkpoints: batch ${batchIndex+1} of ${batches.length}…`);
        await call(`/routes/${selected.id}/checkpoint-batches`,{method:'POST',body:json({routeVersion:selected.version,
          uploadId,batchIndex,batchCount:batches.length,checkpoints})});
      }
      await call(`/routes/${selected.id}/checkpoints/finalize`,{method:'POST',body:json({routeVersion:selected.version,
        uploadId,batchCount:batches.length,checkpointCount:ordered.length})});
      await open(selected.id);setNotice('Checkpoints saved to this draft revision.');
    });
  }
  async function publish() {
    if (!selected) return;
    await action(async () => {
      await call(`/routes/${selected.id}/publish`,{method:'POST',body:json({version:selected.version})});
      await open(selected.id);setNotice('Route published for assignment.');
    });
  }
  async function assign(event:FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await action(async () => {
      await call(`/routes/${selected.id}/assignments`,{method:'POST',body:json({
        requestKey:crypto.randomUUID(),operatorSubject:assignmentSubject.trim(),
        workforceResourceRef:workforceResource.trim(),
        scheduledStart:new Date(assignmentStart).toISOString(),dueAt:new Date(assignmentDue).toISOString(),
      })});
      setNotice('Assignment created. It will appear in the operator’s mobile queue.');
    });
  }
  function addRosterEntry() {
    const entry={operatorSubject:rosterSubject.trim(),workforceResourceRef:rosterResource.trim()};
    if (!entry.operatorSubject || !entry.workforceResourceRef) return;
    if (roster.entries.some((item) => item.operatorSubject===entry.operatorSubject ||
        item.workforceResourceRef===entry.workforceResourceRef)) {
      setError('This operator or Workforce resource is already in the roster.');return;
    }
    if (roster.entries.length>=10) {setError('A route roster holds at most 10 operators.');return;}
    setRoster((current) => ({...current,entries:[...current.entries,entry]}));
    setRosterDirty(true);
    setRosterSubject('');setRosterResource('');setError(null);
  }
  async function saveRoster() {
    if (!selected) return;
    await action(async () => {
      const saved=await call<Roster>(`/routes/${selected.id}/roster`,{method:'POST',
        body:json({expectedVersion:roster.version,entries:roster.entries})});
      setRoster(saved);setRosterDirty(false);
      setNotice('Route roster saved. Generation checks current Workforce eligibility.');
    });
  }
  async function generateAssignments() {
    if (!selected) return;
    await action(async () => {
      const result=await call<GenerationResult>(`/routes/${selected.id}/generate`,{method:'POST',
        body:json({localDate:generationDate,rosterVersion:roster.version})});
      setGenerationResult(result);
      setNotice(`${result.items.filter((item) => item.status==='ASSIGNED').length} assignments accepted; `+
        `${result.items.filter((item) => item.status==='FAILED').length} need attention.`);
    });
  }
  async function submitException(event:FormEvent,item:ExceptionItem) {
    event.preventDefault();
    if (exceptionAction?.id!==item.id || !exceptionNote.trim()) return;
    await action(async () => {
      if (exceptionAction.kind==='RETRY') {
        await call(`/exceptions/${item.id}/retry`,{method:'POST',
          body:json({version:item.version,note:exceptionNote.trim()})});
        setNotice('The original corrective action is queued for CMMS reconciliation.');
      } else {
        await call(`/exceptions/${item.id}`,{method:'PATCH',
          body:json({version:item.version,note:exceptionNote.trim(),resolution:exceptionAction.kind})});
        setNotice('Exception review saved.');
      }
      setExceptionAction(null);setExceptionNote('');
    });
  }
  async function submitSkip(event:FormEvent,item:SkipItem) {
    event.preventDefault();
    if (skipAction?.id!==item.id || !skipNote.trim()) return;
    await action(async () => {
      await call(`/skips/${item.id}/decision`,{method:'POST',
        body:json({version:item.version,decision:skipAction.decision,note:skipNote.trim()})});
      setNotice(skipAction.decision==='APPROVED' ? 'Skip approved.' : 'Skip rejected; the checkpoint is reported as a conformance gap.');
      setSkipAction(null);setSkipNote('');
    });
  }
  function beginException(item:ExceptionItem,kind:'ACKNOWLEDGED'|'RESOLVED'|'RETRY') {
    setExceptionAction({id:item.id,kind});setExceptionNote('');setError(null);
  }
  function editPoint(index:number,update:Partial<RoundCheckpointDraftV1>) {
    setPoints((old) => old.map((point,i) => i === index ? {...point,...update} : point));
  }
  function movePoint(from:number,to:number) {
    try {setPoints(reorderRoundCheckpoints(points,from,to));setError(null);}
    catch (reason) {setError(reason instanceof Error ? reason.message : 'The route order could not be changed.');}
  }
  function drop(event:DragEvent,index:number) {
    event.preventDefault();if (dragged !== null && dragged !== index) movePoint(dragged,index);
    setDragged(null);
  }

  const routeSettingsDirty=selected?.state==='DRAFT' && (
    newTitle.trim()!==selected.title || nullable(unit)!==selected.owningUnitId ||
    nullable(place)!==selected.placeRef || cadence!==selected.schedule.cadence ||
    timeZone!==selected.schedule.timeZone || grace!==selected.schedule.graceMinutes ||
    windowMinutes!==selected.schedule.windowMinutes ||
    (cadence!=='PER_SHIFT' && localTime!==selected.schedule.localTime) ||
    (cadence==='WEEKLY' && weekdays!==selected.schedule.weekdays?.join(','))
  );

  return <div className="flex flex-col gap-4 p-6">
    <Container className="flex flex-col gap-3">
      <Heading level="h1">Operator inspection rounds</Heading>
      <Text className="text-ui-fg-subtle" size="small">Publish versioned routes, assign operators, and review accepted readings and corrective actions.</Text>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Rounds workspace">
        {visibleTabs.map((item) =>
          <Button key={item} type="button" variant={activeTab === item ? 'primary' : 'secondary'}
            onClick={() => setTab(item)}>{item === 'routes' ? 'Routes' : item === 'board' ? 'Live board' : item === 'exceptions' ? 'Exceptions' : 'Skip approvals'}</Button>)}
      </div>
      {visibleTabs.length === 0 && <Alert variant="error">Rounds access is not assigned to this account.</Alert>}
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
    </Container>

    {activeTab === 'routes' && <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Container className="flex flex-col gap-3">
        <Heading level="h2">Routes</Heading>
        {routes.length === 0 && <Text size="small">No routes are available to your scope.</Text>}
        {routes.map((route) => <button key={route.id} type="button" onClick={() => void open(route.id)}
          className={`rounded border p-3 text-left ${selected?.id === route.id ? 'border-ui-border-interactive' : 'border-ui-border-base'}`}>
          <strong>{route.title}</strong><br/><span className="text-sm">{route.code} · rev {route.revision} · {route.state}</span>
        </button>)}
        {can('operator-rounds.routes.manage') && !selected && <form className="flex flex-col gap-2" onSubmit={create}>
          <Heading level="h3">New route</Heading>
          <Label htmlFor="new-code">Code</Label><Input id="new-code" value={newCode} onChange={(e) => setNewCode(e.target.value)} required/>
          <Label htmlFor="new-title">Title</Label><Input id="new-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required/>
          <Button type="submit" disabled={busy}>Create draft</Button>
        </form>}
        {selected && <Button type="button" variant="secondary" onClick={() => {setSelected(null);setPoints([]);setNewTitle('');}}>New route</Button>}
      </Container>

      <Container className="flex flex-col gap-4">
        <Heading level="h2">{selected ? `${selected.title} · revision ${selected.revision}` : 'Route setup'}</Heading>
        {selected && <Text size="small">{selected.state} · version {selected.version}</Text>}
        {(!selected || selected.state === 'DRAFT') && can('operator-rounds.routes.manage') && <div className="grid gap-3 md:grid-cols-2">
          {selected && <div className="flex flex-col gap-1"><Label htmlFor="edit-title">Title</Label><Input id="edit-title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}/></div>}
          <ReferencePicker id="unit" label="Owning unit" value={unit} search={unitLookup.search} resolve={unitLookup.resolve}
            manualLabel="Organization unit ID" placeholder="Search units by name or code" onChange={(option) => setUnit(option?.value ?? '')}/>
          <ReferencePicker id="place" label="Place" value={place} search={placeLookup.search} resolve={placeLookup.resolve}
            manualLabel="Place ID" placeholder="Search sites and places" onChange={(option) => setPlace(option?.value ?? '')}/>
          <div className="flex flex-col gap-1"><Label htmlFor="cadence">Cadence</Label><select id="cadence" className="rounded border p-2" value={cadence} onChange={(e) => setCadence(e.target.value as RoundScheduleV1['cadence'])}><option value="DAILY">Daily</option><option value="PER_SHIFT">Per shift</option><option value="WEEKLY">Weekly</option></select></div>
          <div className="flex flex-col gap-1"><Label htmlFor="zone">IANA time zone</Label><Input id="zone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}/></div>
          {cadence !== 'PER_SHIFT' && <div className="flex flex-col gap-1"><Label htmlFor="time">Local time</Label><Input id="time" type="time" value={localTime} onChange={(e) => setLocalTime(e.target.value)}/></div>}
          {cadence === 'WEEKLY' && <div className="flex flex-col gap-1"><Label htmlFor="weekdays">Weekdays (1–7)</Label><Input id="weekdays" value={weekdays} onChange={(e) => setWeekdays(e.target.value)}/></div>}
          <div className="flex flex-col gap-1"><Label htmlFor="grace">Grace minutes</Label><Input id="grace" type="number" min={0} max={1440} value={grace} onChange={(e) => setGrace(Number(e.target.value))}/></div>
          <div className="flex flex-col gap-1"><Label htmlFor="window-minutes">Assignment window minutes</Label><Input id="window-minutes" type="number" min={1} max={1440} value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))}/></div>
          {selected && <Button type="button" disabled={busy} onClick={() => void saveRoute()}>Save route settings</Button>}
        </div>}

        {selected?.state === 'DRAFT' && can('operator-rounds.routes.manage') && <section className="flex flex-col gap-3">
          <Heading level="h3">Checkpoint canvas</Heading>
          <Text size="small">Drag cards to change visit order. Conditional branches must point forward to another position.</Text>
          <RouteJourneyPreview points={points}/>
          {points.map((point,index) => <div key={point.id ?? `new-${index}`} draggable onDragStart={() => setDragged(index)}
            onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event,index)}
            className="flex flex-col gap-2 rounded border border-ui-border-base p-3">
            <div className="flex items-center justify-between"><strong>Checkpoint {index+1}</strong><Button size="small" variant="secondary" type="button" onClick={() => setPoints((old) => old.filter((_,i) => i !== index).map((item,i) => ({...item,position:i+1})))}>Remove</Button></div>
            <div className="grid gap-2 md:grid-cols-2">
              <Field label="Label" value={point.label} onChange={(value) => editPoint(index,{label:value})}/>
              <ReferencePicker id={`asset-${index}`} label="CMMS asset" value={point.assetRef} search={assetSource.search}
                resolve={assetSource.resolve} manualLabel="CMMS asset ID" placeholder="Search assets by tag or name"
                onChange={(option) => editPoint(index,{assetRef:option?.value ?? '',meterRef:option ? point.meterRef : null,
                  // The asset tag is offered as the checkpoint tag only when none was typed yet.
                  tagCode:point.tagCode || option?.data?.assetTag || ''})}/>
              {point.assetRef ? <ReferencePicker key={point.assetRef} id={`meter-${index}`} label="CMMS meter (optional)"
                value={text(point.meterRef)} search={meterSource(point.assetRef).search} resolve={meterSource(point.assetRef).resolve}
                manualLabel="CMMS meter ID" placeholder="Search this asset's meters"
                onChange={(option) => editPoint(index,{meterRef:option?.value ?? null,
                  unitCode:point.unitCode ?? (option?.data?.unit || null)})}/> : <span/>}
              <Field label="Physical tag code" value={point.tagCode} onChange={(value) => editPoint(index,{tagCode:value})}/>
              <div className="flex flex-col gap-1"><Label>Scan method</Label><select className="rounded border p-2" value={point.proofMode} onChange={(e) => editPoint(index,{proofMode:e.target.value as RoundCheckpointDraftV1['proofMode']})}><option value="EITHER">NFC or barcode</option><option value="NFC">NFC</option><option value="BARCODE">Barcode</option></select></div>
              <div className="flex flex-col gap-1"><Label>Reading type</Label><select className="rounded border p-2" value={point.readingKind} onChange={(e) => {
                const kind = e.target.value as RoundCheckpointDraftV1['readingKind'];
                editPoint(index,{readingKind:kind,unitCode:kind === 'NUMERIC' ? point.unitCode : null,
                  nominal:null,redLow:null,amberLow:null,amberHigh:null,redHigh:null,
                  choices:kind === 'CHOICE' ? point.choices : []});
              }}><option value="BOOLEAN">Pass / fail</option><option value="CHOICE">Choice</option><option value="NUMERIC">Numeric</option></select></div>
              {point.readingKind === 'NUMERIC' ? <>
                <Field label="Unit" value={text(point.unitCode)} onChange={(value) => editPoint(index,{unitCode:nullable(value)})}/>
                {(['nominal','redLow','amberLow','amberHigh','redHigh'] as const).map((key) => <Field key={key} label={key} value={text(point[key])} onChange={(value) => editPoint(index,{[key]:nullable(value)})}/>)}
              </> : point.readingKind === 'CHOICE' ? <Field label="Choices (comma separated)" value={point.choices.join(', ')} onChange={(value) => editPoint(index,{choices:value.split(',').map((v) => v.trim()).filter(Boolean)})}/> : null}
              <Field label="Instructions" value={text(point.instructions)} onChange={(value) => editPoint(index,{instructions:nullable(value)})}/>
              <div className="flex flex-col gap-2 md:col-span-2"><Label>Conditional branches</Label>
                {point.branchRules.map((rule,ruleIndex) => <div key={ruleIndex} className="flex flex-wrap items-center gap-2">
                  <select className="rounded border p-2" value={rule.condition} onChange={(event) => {
                    const condition = event.target.value;
                    const next = point.branchRules.map((item,i) => i !== ruleIndex ? item :
                      condition === 'ALWAYS' ? {condition:'ALWAYS' as const,nextPosition:item.nextPosition} :
                      condition === 'STATUS_IS' ? {condition:'STATUS_IS' as const,value:'NORMAL' as const,nextPosition:item.nextPosition} :
                        {condition:'VALUE_EQUALS' as const,value:'',nextPosition:item.nextPosition});
                    editPoint(index,{branchRules:next});
                  }}><option value="ALWAYS">Always</option><option value="VALUE_EQUALS">Value equals</option><option value="STATUS_IS">Status is</option></select>
                  {rule.condition !== 'ALWAYS' && (rule.condition === 'STATUS_IS' ?
                    <select className="rounded border p-2" value={rule.value} onChange={(event) => editPoint(index,{branchRules:point.branchRules.map((item,i) => i === ruleIndex ? {...rule,value:event.target.value as 'NORMAL'|'AMBER'|'RED'} : item)})}>
                      <option value="">Select status</option><option value="NORMAL">Normal</option><option value="AMBER">Amber</option><option value="RED">Red</option></select> :
                    <Input aria-label="Matching value" value={rule.value} onChange={(event) => editPoint(index,{branchRules:point.branchRules.map((item,i) => i === ruleIndex ? {...rule,value:event.target.value} : item)})}/>)}
                  <Input aria-label="Next checkpoint position" type="number" min={index+2} max={points.length}
                    value={rule.nextPosition} onChange={(event) => editPoint(index,{branchRules:point.branchRules.map((item,i) => i === ruleIndex ? {...item,nextPosition:Number(event.target.value)} : item)})}/>
                  <Button size="small" variant="secondary" type="button" onClick={() => editPoint(index,{branchRules:point.branchRules.filter((_,i) => i !== ruleIndex)})}>Remove rule</Button>
                </div>)}
                <Button size="small" variant="secondary" type="button" onClick={() => editPoint(index,{branchRules:[...point.branchRules,{condition:'ALWAYS',nextPosition:Math.min(index+2,points.length)}]})}>Add branch</Button>
              </div>
              <label className="flex items-center gap-2"><input type="checkbox" checked={point.photoOnException} onChange={(e) => editPoint(index,{photoOnException:e.target.checked})}/>Require photo on exception</label>
            </div>
          </div>)}
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setPoints((old) => [...old,blankPoint(old.length+1)])}>Add checkpoint</Button><Button type="button" disabled={busy || points.length === 0} onClick={() => void savePoints()}>Save checkpoints</Button></div>
          {can('operator-rounds.routes.publish') && <>
            <Button type="button" disabled={busy || points.length === 0}
              onClick={() => setPublishReview(true)}>Review publication</Button>
            {publishReview && <div role="region" aria-label="Publish route review"
              className="flex flex-col gap-2 rounded border border-ui-border-base p-3">
              <Text size="small">Publishing {selected.title} revision {selected.revision} makes its {selected.checkpoints?.length ?? 0} saved checkpoints available for assignments. Schedule: {selected.schedule.cadence} in {selected.schedule.timeZone}. A different authorized person must approve.</Text>
              {routeSettingsDirty || JSON.stringify(points)!==JSON.stringify(selected.checkpoints ?? [])
                ? <Text size="small">Save route and checkpoint changes before publishing.</Text>
                : <Button type="button" disabled={busy} onClick={() => void publish()}>Confirm publication</Button>}
              <Button type="button" variant="secondary" onClick={() => setPublishReview(false)}>Cancel</Button>
            </div>}
          </>}
        </section>}

        {selected && selected.state !== 'DRAFT' &&
          (permissions.includes('*') || permissions.includes('analytics:*') || permissions.includes('analytics:read')) &&
          <RoundInspectionTrend key={selected.id} checkpoints={selected.checkpoints ?? []}/>}
        {selected?.state === 'PUBLISHED' && can('operator-rounds.assignments.manage') && <form className="grid gap-2 md:grid-cols-2" onSubmit={assign}>
          <Heading level="h3">Assign published route</Heading><span/>
          <ReferencePicker id="assign-operator" label="Operator" value={workforceResource} search={operatorSource.search}
            resolve={operatorSource.resolve} manualLabel="Workforce resource ID" placeholder="Search people with a login"
            onChange={(option) => {setWorkforceResource(option?.value ?? '');setAssignmentSubject(option?.data?.operatorSubject ?? '');}}/>
          {workforceResource && !assignmentSubject ? <Field label="Operator user ID" value={assignmentSubject} onChange={setAssignmentSubject}/> : <span/>}
          <div className="flex flex-col gap-1"><Label htmlFor="assign-start">Scheduled start</Label><Input id="assign-start" type="datetime-local" value={assignmentStart} onChange={(e) => setAssignmentStart(e.target.value)} required/></div>
          <div className="flex flex-col gap-1"><Label htmlFor="assign-due">Due at</Label><Input id="assign-due" type="datetime-local" value={assignmentDue} onChange={(e) => setAssignmentDue(e.target.value)} required/></div>
          <Button type="submit" disabled={busy}>Create assignment</Button>
        </form>}

        {selected?.state === 'PUBLISHED' && can('operator-rounds.assignments.manage') && <section className="flex flex-col gap-3 rounded border border-ui-border-base p-3">
          <Heading level="h3">Scheduled operator roster</Heading>
          <Text size="small">Each generated assignment is checked against Workforce’s current position, shift and absence. Save the roster before generating.</Text>
          {roster.entries.map((entry) => <div className="flex flex-wrap items-center justify-between gap-2" key={entry.workforceResourceRef}>
            <Text size="small">{entry.operatorSubject} · {entry.workforceResourceRef}</Text>
            <Button type="button" size="small" variant="secondary" disabled={busy}
              onClick={() => {setRoster((current) => ({...current,entries:current.entries.filter((item) => item.workforceResourceRef!==entry.workforceResourceRef)}));setRosterDirty(true);}}>Remove</Button>
          </div>)}
          <div className="grid gap-2 md:grid-cols-2">
            <ReferencePicker key={`roster-${roster.entries.length}`} id="roster-operator" label="Operator" value={rosterResource}
              search={operatorSource.search} resolve={operatorSource.resolve} manualLabel="Workforce resource ID"
              placeholder="Search people with a login"
              onChange={(option) => {setRosterResource(option?.value ?? '');setRosterSubject(option?.data?.operatorSubject ?? '');}}/>
            {rosterResource && !rosterSubject ? <Field label="Operator user ID" value={rosterSubject} onChange={setRosterSubject}/> : <span/>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={busy || roster.entries.length>=10} onClick={addRosterEntry}>Add operator</Button>
            <Button type="button" disabled={busy} onClick={() => void saveRoster()}>Save roster</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1"><Label htmlFor="generation-date">Local route date</Label><Input id="generation-date" type="date" value={generationDate} onChange={(event) => setGenerationDate(event.target.value)}/></div>
              <Button type="button" disabled={busy || rosterDirty || roster.version===0 || roster.entries.length===0}
                onClick={() => void generateAssignments()}>Generate assignments</Button>
          </div>
          {generationResult && <div role="status" className="flex flex-col gap-1">
            <Text size="small">{generationResult.localDate}{generationResult.scheduledStart && generationResult.dueAt ? `: ${datetime(generationResult.scheduledStart)} to ${datetime(generationResult.dueAt)}` : ': Workforce shift windows'}</Text>
            {generationResult.items.map((item,index) => <Text size="small" key={`${item.workforceResourceRef}:${item.scheduledStart ?? index}`}>
              {item.operatorSubject}{item.scheduledStart ? ` · ${datetime(item.scheduledStart)}` : ''}: {item.status === 'ASSIGNED' ? item.replayed ? 'Already assigned' : 'Assigned' : `Failed (${item.code ?? 'unknown'})`}
            </Text>)}
          </div>}
          {roster.version>0 && <RoundsScheduleControl routeId={selected.id}
            routeTitle={selected.title} timeZone={selected.schedule.timeZone}/>}
        </section>}
      </Container>
    </div>}

    {activeTab === 'board' && <Container className="flex flex-col gap-3">
      <Heading level="h2">Live inspections</Heading>
      <Text size="small">Accepted server readings update this board every 15 seconds.</Text>
      {!can('operator-rounds.board.read') ? <Text>Board permission is required.</Text> : board.length === 0 ? <Text>No assignments yet.</Text> :
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Route</th><th>Operator</th><th>Status</th><th>Readings</th><th>Exceptions</th><th>Skips</th><th>Due</th></tr></thead><tbody>{board.map((item) =>
          <tr key={item.id} className="border-t"><td>{item.routeTitle} ({item.routeCode})</td><td>{item.operatorSubject}</td><td>{item.overdue ? 'OVERDUE' : item.state}</td><td>
            {item.readingCount} accepted
          </td><td>{item.exceptionCount}</td><td>{item.skips ? skipSummary(item.skips) : '—'}</td><td>{datetime(item.dueAt)}</td></tr>)}</tbody></table></div>}
    </Container>}

    {activeTab === 'exceptions' && <Container className="flex flex-col gap-3">
      <Heading level="h2">Exception review</Heading>
      {!can('operator-rounds.exceptions.read') ? <Text>Exception permission is required.</Text> : exceptions.length === 0 ? <Text>No exceptions.</Text> :
        <div className="flex flex-col gap-3">{exceptions.map((item) => <div key={item.id} className="rounded border border-ui-border-base p-3">
          <div className="flex flex-wrap justify-between gap-2"><strong>{item.origin === 'DEFECT' ? 'Defect' : item.severity} · {item.routeCode} · {item.checkpointLabel}</strong><span>{item.state}</span></div>
          {item.origin === 'DEFECT' && <Text size="small">{item.severity} defect reported by {item.reportedBy}: {item.description}</Text>}
          <Text size="small">Asset {item.assetRef} · {datetime(item.createdAt)}</Text>
          <Text size="small">CMMS work order: {item.cmmsWorkOrderRef ?? (item.refusalCode ? `Refused: ${item.refusalCode}`
            : item.origin === 'DEFECT' && item.state === 'OPEN' ? 'Not requested; supervisor review' : 'Pending reconciliation')}</Text>
          {item.reviewNote && <Text size="small">Review: {item.reviewNote}</Text>}
          {can('operator-rounds.exceptions.review') && item.state !== 'RESOLVED' && <div className="mt-2 flex flex-wrap gap-2"><Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => beginException(item,'ACKNOWLEDGED')}>Add review</Button><Button type="button" size="small" disabled={busy || item.state === 'ACTION_PENDING'} onClick={() => beginException(item,'RESOLVED')}>Resolve</Button>{item.state === 'ACTION_REJECTED' && <Button type="button" size="small" disabled={busy} onClick={() => beginException(item,'RETRY')}>Retry CMMS action</Button>}</div>}
          {exceptionAction?.id===item.id && <form className="mt-3 flex flex-col gap-2 rounded border border-ui-border-base p-3" onSubmit={(event) => void submitException(event,item)}>
            <Heading level="h3">{exceptionAction.kind==='RETRY' ? 'Retry the original CMMS action' : exceptionAction.kind==='RESOLVED' ? 'Resolve exception' : 'Add supervisor review'}</Heading>
            <Text size="small">{exceptionAction.kind==='RETRY' ? 'Explain why retry is appropriate. The existing action key is reused.' : 'Record the observation and action taken for this exception.'}</Text>
            <Label htmlFor={`exception-note-${item.id}`}>Review note</Label>
            <Input id={`exception-note-${item.id}`} value={exceptionNote} maxLength={2000} required
              onChange={(event) => setExceptionNote(event.target.value)}/>
            <div className="flex gap-2"><Button type="submit" size="small" disabled={busy || !exceptionNote.trim()}>Confirm {exceptionAction.kind==='RETRY' ? 'retry' : exceptionAction.kind==='RESOLVED' ? 'resolution' : 'review'}</Button>
              <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => {setExceptionAction(null);setExceptionNote('');}}>Cancel</Button></div>
          </form>}
        </div>)}</div>}
    </Container>}

    {activeTab === 'skips' && <Container className="flex flex-col gap-3">
      <Heading level="h2">Skip approvals</Heading>
      <Text size="small">An operator passed these checkpoints without a reading. A different authorized person approves or rejects each one; a rejected skip stays on the run as a conformance gap.</Text>
      {skips.length === 0 ? <Text>No skip requests.</Text> :
        <div className="flex flex-col gap-3">{skips.map((item) => <div key={item.id} className="rounded border border-ui-border-base p-3">
          <div className="flex flex-wrap justify-between gap-2"><strong>{item.routeCode} · {item.checkpointLabel}</strong><span>{item.state}</span></div>
          <Text size="small">{SKIP_REASONS[item.reasonCode] ?? item.reasonCode}{item.note ? `: ${item.note}` : ''}</Text>
          <Text size="small">Requested by {item.requestedBy} · {datetime(item.capturedAt)} · Asset {item.assetRef}</Text>
          {item.decidedBy && <Text size="small">Decided by {item.decidedBy}: {item.decisionNote}</Text>}
          {item.state === 'REQUESTED' && <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => {setSkipAction({id:item.id,decision:'APPROVED'});setSkipNote('');}}>Approve</Button>
            <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => {setSkipAction({id:item.id,decision:'REJECTED'});setSkipNote('');}}>Reject</Button></div>}
          {skipAction?.id===item.id && <form className="mt-3 flex flex-col gap-2 rounded border border-ui-border-base p-3" onSubmit={(event) => void submitSkip(event,item)}>
            <Heading level="h3">{skipAction.decision==='APPROVED' ? 'Approve skip' : 'Reject skip'}</Heading>
            <Label htmlFor={`skip-note-${item.id}`}>Decision note</Label>
            <Input id={`skip-note-${item.id}`} value={skipNote} maxLength={2000} required onChange={(event) => setSkipNote(event.target.value)}/>
            <div className="flex gap-2"><Button type="submit" size="small" disabled={busy || !skipNote.trim()}>Confirm {skipAction.decision==='APPROVED' ? 'approval' : 'rejection'}</Button>
              <Button type="button" size="small" variant="secondary" disabled={busy} onClick={() => {setSkipAction(null);setSkipNote('');}}>Cancel</Button></div>
          </form>}
        </div>)}</div>}
    </Container>}
  </div>;
}

function skipSummary(skips:{requested:number;approved:number;rejected:number}):string {
  const parts = [skips.requested ? `${skips.requested} pending` : '', skips.approved ? `${skips.approved} approved` : '',
    skips.rejected ? `${skips.rejected} rejected` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'None';
}

function Field({label,value,onChange}:{readonly label:string;readonly value:string;readonly onChange:(value:string) => void}) {
  return <label className="flex flex-col gap-1"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)}/></label>;
}
