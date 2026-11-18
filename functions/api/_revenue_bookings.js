import {SPACES,err,isDate,json,kstToday} from './_lib.js';
import {settlementsFor} from './_settlement.js';
import {revenueBookingIncludedSql} from './_revenue_exclusions.js';

const totals=()=>({bookingCount:0,booked:0,received:0,refunded:0,netReceived:0,
  balance:0,balanceCount:0,amountUnknownCount:0,balanceUnknownCount:0,
  excessPaid:0,excessPaidCount:0,reviewRequiredCount:0,overRefunded:0});
function add(summary,s) {
  summary.bookingCount++;
  if(s.amount==null)summary.amountUnknownCount++;else summary.booked+=s.amount;
  summary.received+=s.received;summary.refunded+=s.refunded;summary.netReceived+=s.net;
  if(s.balance==null)summary.balanceUnknownCount++;
  else {summary.balance+=s.balance;if(s.balance>0)summary.balanceCount++;}
  if(s.refund_due>0){summary.excessPaid+=s.refund_due;summary.excessPaidCount++;}
  if(s.review_required)summary.reviewRequiredCount++;
  summary.overRefunded+=s.over_refunded||0;
}
function monthTotals(from,to) {
  const months=new Map(),cursor=new Date(from.slice(0,7)+'-01T00:00:00Z'),last=to.slice(0,7);
  while(cursor.toISOString().slice(0,7)<=last) {
    const month=cursor.toISOString().slice(0,7);
    months.set(month,{month,...totals()});
    cursor.setUTCMonth(cursor.getUTCMonth()+1);
  }
  return months;
}

const statuses=['confirmed','completed'];
async function bookingCohort({env,from,to,space='',operationalBookingSql='1=1'},identities=false) {
  const where=["b.status IN ('confirmed','completed')",'b.date BETWEEN ? AND ?',`(${operationalBookingSql})`,revenueBookingIncludedSql()];
  const args=[from,to];
  if(space==='unassigned') {
    const known=Object.keys(SPACES);
    where.push(`(b.space_id IS NULL OR b.space_id NOT IN (${known.map(()=>'?').join(',')}))`);
    args.push(...known);
  } else if(space) { where.push('b.space_id=?');args.push(space); }
  const identityColumns=identities?',b.customer_name,b.space_id,b.start_h,b.end_h,b.slot':'';
  const {results}=await env.DB.prepare(`SELECT b.booking_code,b.date AS event_date${identityColumns}
    FROM bookings b WHERE ${where.join(' AND ')}
    ORDER BY b.date,b.start_h IS NULL,b.start_h,b.customer_name,b.booking_code`).bind(...args).all();
  const settlements=await settlementsFor(env,(results||[]).map(row=>row.booking_code));
  // A concurrently cancelled/deleted booking must not enter the active-booking report.
  return (results||[]).filter(row=>statuses.includes(settlements[row.booking_code]?.booking_status))
    .map(row=>({...row,settlement:settlements[row.booking_code]}));
}
function summarize(cohort,{from,to,space=''}) {
  const monthly=monthTotals(from,to);
  const summary={scope:{from,to,space,statuses,filters:'period-space'},...totals()};
  for(const row of cohort) {
    add(summary,row.settlement);
    add(monthly.get(row.event_date.slice(0,7)),row.settlement);
  }
  return {...summary,monthly:[...monthly.values()]};
}

// Cards, monthly bars and their reservation lists share one cohort and settlement source.
// Receipt-analysis filters cannot identify unpaid reservations, so they never narrow it.
export async function revenueBookingSummary(options) {
  return summarize(await bookingCohort(options),options);
}

export async function revenueBookingsAdmin({env,url,method,operationalBookingSql='1=1'}) {
  if(method!=='GET')return err('지원하지 않는 요청입니다.',405);
  const q=url.searchParams,today=kstToday(),[year,month]=today.slice(0,7).split('-').map(Number);
  const from=q.get('from')??today.slice(0,7)+'-01',to=q.get('to')??new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const space=q.get('space')??'',metric=q.get('metric')??'booked',page=Number(q.get('page')??1),pageSize=50;
  if(!isDate(from)||!isDate(to)||from>to||Date.parse(to)-Date.parse(from)>365*864e5)
    return err('조회 기간을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.');
  if((space&&space!=='unassigned'&&!Object.hasOwn(SPACES,space))||
    !['booked','received','balance'].includes(metric)||!Number.isSafeInteger(page)||page<1||page>100000)
    return err('조회 조건을 확인해 주세요.');
  const options={env,from,to,space,operationalBookingSql},cohort=await bookingCohort(options,true),summary=summarize(cohort,options);
  const selected=cohort.filter(({settlement:s})=>metric==='booked'||(metric==='received'?(s.received>0||s.refunded>0):s.balance>0));
  const total={count:selected.length,amount:summary[metric==='received'?'netReceived':metric],
    unknownCount:metric==='booked'?summary.amountUnknownCount:metric==='balance'?summary.balanceUnknownCount:0};
  const items=selected.slice((page-1)*pageSize,page*pageSize).map(row=>{
    const s=row.settlement;
    return {booking_code:row.booking_code,customer_name:row.customer_name,date:row.event_date,space_id:row.space_id,
      status:s.booking_status,start_h:row.start_h,end_h:row.end_h,slot:row.slot,amount:s.amount,
      received:s.received,refunded:s.refunded,netReceived:s.net,balance:s.balance,
      review_required:!!s.review_required,excessPaid:s.refund_due,overRefunded:s.over_refunded||0};
  });
  return json({ok:true,metric,summary,total,items,detailCount:selected.length,page,pageSize},200,{'cache-control':'no-store'});
}
