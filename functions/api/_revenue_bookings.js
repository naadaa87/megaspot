import {SPACES} from './_lib.js';
import {settlementsFor} from './_settlement.js';

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

// Cards and monthly bars describe the same booking cohort. Receipt-analysis filters
// cannot identify unpaid reservations, so category/channel/component/day/page never narrow it.
export async function revenueBookingSummary({env,from,to,space='',operationalBookingSql='1=1'}) {
  const statuses=['confirmed','completed'],where=["b.status IN ('confirmed','completed')",'b.date BETWEEN ? AND ?',operationalBookingSql];
  const args=[from,to];
  if(space==='unassigned') {
    const known=Object.keys(SPACES);
    where.push(`(b.space_id IS NULL OR b.space_id NOT IN (${known.map(()=>'?').join(',')}))`);
    args.push(...known);
  } else if(space) { where.push('b.space_id=?');args.push(space); }
  const {results}=await env.DB.prepare(`SELECT b.booking_code,b.date AS event_date FROM bookings b WHERE ${where.join(' AND ')} ORDER BY b.booking_code`).bind(...args).all();
  const settlements=await settlementsFor(env,(results||[]).map(row=>row.booking_code));
  const monthly=monthTotals(from,to);
  const summary={scope:{from,to,space,statuses,filters:'period-space'},...totals()};
  for(const row of results||[]) {
    const s=settlements[row.booking_code];
    // A concurrently cancelled/deleted booking must not enter the active-booking cards.
    if(!s||!statuses.includes(s.booking_status))continue;
    add(summary,s);
    add(monthly.get(row.event_date.slice(0,7)),s);
  }
  return {...summary,monthly:[...monthly.values()]};
}
