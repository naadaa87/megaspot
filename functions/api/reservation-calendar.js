// Public read model: confirmed occupancy only; never select customer or booking identifiers.
import {json,err,hasDb,isDate,kstToday,SPACES,SPACE_OPENING} from './_lib.js';
const DAY=864e5,HOUR=36e5;
const midnight=d=>Date.parse(d+'T00:00:00Z');
const dayAt=n=>new Date(n).toISOString().slice(0,10);
const stamp=n=>new Date(n).toISOString().slice(0,19)+'+09:00';
export async function onRequestGet({request,env}){
 if(!hasDb(env))return err('예약 현황을 불러올 수 없습니다.',503,'NO_DB');
 const q=new URL(request.url).searchParams,from=q.get('from'),to=q.get('to');
 if(!isDate(from)||!isDate(to)||from>to||midnight(to)-midnight(from)>61*DAY||from<kstToday(-31)||to>kstToday(400))return err('조회할 날짜 범위를 확인해 주세요.',400,'INVALID_RANGE');
 try{
  // Include earlier anchors whose overnight hours reach the requested calendar days.
  const {results}=await env.DB.prepare(`SELECT b.space_id, b.date,
    CASE WHEN b.start_h IS NULL AND b.end_h IS NULL AND json_valid(i.data) THEN json_extract(i.data,'$.start_h') ELSE b.start_h END AS start_h,
    CASE WHEN b.start_h IS NULL AND b.end_h IS NULL AND json_valid(i.data) THEN json_extract(i.data,'$.end_h') ELSE b.end_h END AS end_h
    FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref
    WHERE b.status = 'confirmed' AND b.space_id IN ('megaspot-gundae','megaspot-gundae-2') AND b.date BETWEEN ? AND ?
    ORDER BY b.space_id, b.date, b.start_h LIMIT 5001`).bind(dayAt(midnight(from)-2*DAY),to).all();
  if((results||[]).length>5000)return err('조회 범위를 줄여 다시 확인해 주세요.',503,'TOO_MANY_INTERVALS');
  const intervals=[],unknownDates=[],seen=new Set(),lo=midnight(from),hi=midnight(to)+DAY,today=midnight(kstToday());
  for(const row of results||[]){
   if(!Object.hasOwn(SPACES,row.space_id)||!isDate(row.date))continue;
   const base=midnight(row.date),s=row.start_h,e=row.end_h;
   if(typeof s!=='number'||typeof e!=='number'||!Number.isInteger(s)||!Number.isInteger(e)||s<0||e>48||e<=s){
    const key=row.space_id+row.date;
    if(row.date>=from&&row.date<=to&&base>=today&&!seen.has(key)){unknownDates.push({space:row.space_id,date:row.date});seen.add(key);}
    continue;
   }
   const start=base+s*HOUR,end=base+e*HOUR;
   if(start<hi&&end>lo&&end>today)intervals.push({space:row.space_id,start,end});
  }
  intervals.sort((a,b)=>a.space.localeCompare(b.space)||a.start-b.start||a.end-b.end);
  const merged=[];
  for(const it of intervals){const last=merged.at(-1);if(last&&last.space===it.space&&it.start<=last.end)last.end=Math.max(last.end,it.end);else merged.push({...it});}
  return json({ok:true,timezone:'Asia/Seoul',range:{from,to},spaces:Object.entries(SPACES).map(([id,name])=>({id,name,opensOn:SPACE_OPENING[id]||null})),intervals:merged.map(it=>({space:it.space,start:stamp(it.start),end:stamp(it.end)})),unknownDates,updatedAt:new Date().toISOString()},200,{'cache-control':'no-store'});
 }catch{return err('예약 현황을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.',503,'CALENDAR_UNAVAILABLE');}
}
