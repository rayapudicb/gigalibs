import { createHash } from 'node:crypto';
import { RoundScheduleV1 } from '@gigalibs/contracts';
import { ConflictException } from '@nestjs/common';

/** Resolve a route's wall-clock occurrence without using the server's local time zone. */
export function roundOccurrence(rawSchedule:unknown,localDate:string) {
  const schedule=RoundScheduleV1.parse(rawSchedule);
  if (schedule.cadence==='PER_SHIFT')
    throw new ConflictException('Per-shift generation needs authoritative Workforce shift windows.');
  if (!schedule.localTime) throw new ConflictException('The route needs a local start time.');
  const day=new Date(`${localDate}T00:00:00.000Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10)!==localDate)
    throw new ConflictException('Invalid schedule date.');
  const weekday=(day.getUTCDay()+6)%7+1;
  if (schedule.cadence==='WEEKLY' && !schedule.weekdays?.includes(weekday)) return null;
  const wall=`${localDate}T${schedule.localTime}`;
  const [datePart,timePart]=wall.split('T') as [string,string];
  const [year,month,date]=datePart.split('-').map(Number) as [number,number,number];
  const [hour,minute]=timePart.split(':').map(Number) as [number,number];
  const wallUtc=Date.UTC(year,month-1,date,hour,minute);
  const format=new Intl.DateTimeFormat('en-US',{timeZone:schedule.timeZone,hourCycle:'h23',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const rendered=(instant:number) => {
    const parts=Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type,part.value]));
    return Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),
      Number(parts.hour),Number(parts.minute));
  };
  const offsets=new Set([wallUtc-86_400_000,wallUtc,wallUtc+86_400_000]
    .map((instant) => rendered(instant)-instant));
  const candidates=[...offsets].map((offset) => wallUtc-offset)
    .filter((instant) => rendered(instant)===wallUtc).sort((a,b) => a-b);
  if (!candidates.length) throw new ConflictException('The route time does not exist on this date in its time zone.');
  const start=candidates[0]!;
  return {scheduledStart:new Date(start).toISOString(),
    dueAt:new Date(start+schedule.windowMinutes*60_000).toISOString()};
}

/** A repeat request uses the same key; changing a roster cannot silently duplicate an occurrence. */
export function occurrenceRequestKey(routeId:string,resourceId:string,localDate:string):string {
  const namespace=Buffer.from('5d6d8d3f6b164ef88fad77fb483ed394','hex');
  const bytes=createHash('sha1').update(namespace)
    .update(JSON.stringify([routeId,resourceId,localDate]))
    .digest().subarray(0,16);
  bytes[6]=(bytes[6]!&0x0f)|0x50;
  bytes[8]=(bytes[8]!&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
