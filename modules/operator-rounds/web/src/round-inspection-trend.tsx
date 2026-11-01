'use client';

import { RoundInspectionTrendV1, type RoundInspectionTrendV1 as Trend } from '@gigalibs/contracts';
import { Alert, Button, Heading, Text } from '@medusajs/ui';
import { useEffect, useRef, useState } from 'react';

type Checkpoint = {id?:string;label:string;assetRef:string;unitCode:string|null;readingKind:string};

/** Return only finite plotted points. A table below the chart carries the exact values. */
export function trendPoints(days:Trend['days']):string {
  if (days.length===0) return '';
  const values=days.map((day) => Number(day.average));
  if (values.some((value) => !Number.isFinite(value))) return '';
  const low=Math.min(...values),high=Math.max(...values);
  const width=440,height=140,pad=10,range=high-low;
  return values.map((value,index) => {
    const x=pad+(days.length===1 ? (width-2*pad)/2 : index*(width-2*pad)/(days.length-1));
    const y=range===0 ? height/2 : height-pad-(value-low)*(height-2*pad)/range;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(' ');
}

export function RoundInspectionTrend({checkpoints}:{readonly checkpoints:readonly Checkpoint[]}) {
  const numeric=checkpoints.filter((point) => point.id && point.readingKind==='NUMERIC' && point.unitCode);
  const [selected,setSelected]=useState<string>('');
  const [trend,setTrend]=useState<Trend|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const requestVersion=useRef(0);
  useEffect(() => () => {requestVersion.current+=1;},[]);

  async function load() {
    const point=numeric.find((item) => item.id===selected);
    if (!point?.id || !point.unitCode) return;
    const version=++requestVersion.current;
    setLoading(true);setTrend(null);setError(null);
    try {
      const query=new URLSearchParams({assetId:point.assetRef,checkpointId:point.id,unitCode:point.unitCode});
      const response=await fetch(`/api/analytics/v1/rounds/trend?${query}`,{cache:'no-store'});
      if (response.status===401) {window.location.assign('/login');return;}
      if (!response.ok) throw new Error(`Trend is unavailable (${response.status}).`);
      const parsed=RoundInspectionTrendV1.parse(await response.json());
      if (parsed.assetId!==point.assetRef || parsed.checkpointId!==point.id || parsed.unitCode!==point.unitCode)
        throw new Error('Trend response does not match this checkpoint.');
      if (version===requestVersion.current) setTrend(parsed);
    } catch (reason) {
      if (version===requestVersion.current)
        setError(reason instanceof Error ? reason.message : 'Trend could not be loaded.');
    } finally {if (version===requestVersion.current) setLoading(false);}
  }

  return <section className="flex flex-col gap-3 rounded border border-ui-border-base p-3" aria-label="Inspection trend">
    <Heading level="h3">90-day inspection trend</Heading>
    <Text size="small">Daily average of accepted manual numeric readings. Analytics permission and place scope apply. Recent readings may take time to arrive.</Text>
    {numeric.length===0 ? <Text size="small">This route has no numeric checkpoints.</Text> : <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">Checkpoint
        <select className="rounded border p-2" value={selected} onChange={(event) => {
          requestVersion.current+=1;setSelected(event.target.value);setTrend(null);setError(null);setLoading(false);
        }}>
          <option value="">Choose a checkpoint</option>
          {numeric.map((point) => <option key={point.id} value={point.id}>{point.label} · {point.unitCode}</option>)}
        </select>
      </label>
      <Button type="button" variant="secondary" disabled={!selected || loading} onClick={() => void load()}>{loading ? 'Loading…' : 'Show trend'}</Button>
    </div>}
    {error && <Alert variant="error">{error}</Alert>}
    {trend && (trend.days.length===0 ? <Text size="small">No accepted manual numeric readings in this 90-day window.</Text> : <>
      <svg viewBox="0 0 440 140" className="h-36 w-full rounded bg-ui-bg-subtle" role="img" aria-label={`Daily average inspection values from ${trend.from} to ${trend.to}`}>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={trendPoints(trend.days)}/>
        {trend.days.length===1 && <circle cx="220" cy="70" r="4" fill="currentColor"/>}
      </svg>
      <div className="max-h-64 overflow-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Exact daily inspection readings</caption>
        <thead><tr><th scope="col">UTC day</th><th scope="col">Average</th><th scope="col">Minimum</th><th scope="col">Maximum</th><th scope="col">Readings</th></tr></thead>
        <tbody>{trend.days.map((day) => <tr key={day.day} className="border-t"><th scope="row">{day.day}</th>
          <td>{day.average} {day.unitCode}</td><td>{day.minimum}</td><td>{day.maximum}</td><td>{day.sampleCount}</td></tr>)}</tbody>
      </table></div>
    </>)}
  </section>;
}
