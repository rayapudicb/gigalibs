'use client';

import type { KernelScheduleListV1 } from '@gigalibs/contracts';
import { Button, Text } from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';

const BASE='/api/control/tenants/current/schedules';

/** Kernel schedules execute as their current owner, rechecking Rounds permission on every run. */
export function RoundsScheduleControl(props:{routeId:string;routeTitle:string;timeZone:string}) {
  const [list,setList]=useState<KernelScheduleListV1|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [confirmRemove,setConfirmRemove]=useState<string|null>(null);
  const refresh=useCallback(async (signal?:AbortSignal) => {
    const query=new URLSearchParams({operation:'operator-rounds.generate',targetId:props.routeId});
    const response=await fetch(`${BASE}?${query}`,{cache:'no-store',signal});
    if (!response.ok) throw new Error('Scheduled generation is unavailable.');
    setList(await response.json() as KernelScheduleListV1);
  },[props.routeId]);
  useEffect(() => {
    const abort=new AbortController();
    setList(null);
    void refresh(abort.signal).catch(() => { if (!abort.signal.aborted) setError('Scheduled generation is unavailable.'); });
    return () => abort.abort();
  },[refresh]);
  const act=async (path:string,body?:Record<string,unknown>) => {
    setBusy(true);setError(null);
    try {
      const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body??{})});
      if (!response.ok) throw new Error(`Schedule action was refused (${response.status}).`);
      setConfirmRemove(null);
      await refresh();
    } catch (cause) {setError((cause as Error).message);}
    finally {setBusy(false);}
  };
  return <section className="flex flex-col gap-2 border-t border-ui-border-base pt-3">
    <Text size="small">Automatic generation runs once each route-local day in {props.timeZone}. Every run checks the schedule owner’s current access and each operator’s Workforce eligibility.</Text>
    {error && <Text size="small">{error}</Text>}
    {!list ? <Text size="small">Loading generation schedule…</Text> : <>
      {list.schedules.map((schedule) => <div key={schedule.id} className="flex items-center gap-2">
        <Text size="small">{schedule.status} · next {schedule.nextRunAt}</Text>
        {schedule.canManage && <Button type="button" size="small" variant="secondary" disabled={busy}
          onClick={() => void act(`${BASE}/${schedule.id}/${schedule.status==='ACTIVE'?'pause':'resume'}`)}>
          {schedule.status==='ACTIVE'?'Pause':'Resume'}
        </Button>}
        {schedule.canManage && <Button type="button" size="small" variant="secondary" disabled={busy}
          onClick={() => confirmRemove===schedule.id
            ? void act(`${BASE}/${schedule.id}/remove`)
            : setConfirmRemove(schedule.id)}>
          {confirmRemove===schedule.id?'Confirm remove':'Remove'}
        </Button>}
      </div>)}
      {list.canCreate && list.schedules.length===0 && <Button type="button" size="small" disabled={busy}
        onClick={() => void act(BASE,{name:`${props.routeTitle} · daily rounds`,
          operation:'operator-rounds.generate',targetId:props.routeId,
          cron:'0 0 * * *',timeZone:props.timeZone})}>Enable automatic generation</Button>}
    </>}
  </section>;
}
