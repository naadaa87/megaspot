import {SPACES,err,isDate,json,kstToday} from './_lib.js';
import {settlementsFor} from './_settlement.js';
import {revenueBookingIncludedSql} from './_revenue_exclusions.js';
import {bookingPhone2Sql} from './_contacts.js';

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
async function bookingCohort({env,from,to,space='',bookingCode='',operationalBookingSql='1=1'},identities=false) {
  const where=["b.status IN ('confirmed','completed')",'b.date BETWEEN ? AND ?',`(${operationalBookingSql})`,revenueBookingIncludedSql()];
  const args=[from,to];
  if(space==='unassigned') {
    const known=Object.keys(SPACES);
    where.push(`(b.space_id IS NULL OR b.space_id NOT IN (${known.map(()=>'?').join(',')}))`);
    args.push(...known);
  } else if(space) { where.push('b.space_id=?');args.push(space); }
  if(bookingCode){where.push('b.booking_code=?');args.push(bookingCode);}
  const identityColumns=identities?',b.customer_name,b.space_id,b.start_h,b.end_h,b.slot':'';
  const detailColumns=identities==='detail'?`,b.inquiry_ref,b.phone,${bookingPhone2Sql()} AS phone2,b.headcount,b.memo,b.created_at,b.updated_at,
    (SELECT COUNT(*) FROM bookings other WHERE other.inquiry_ref=b.inquiry_ref AND other.status<>'cancelled') AS inquiry_booking_count,
    (SELECT COUNT(*) FROM bookings other WHERE other.inquiry_ref=b.inquiry_ref AND other.status<>'cancelled' AND other.date=b.date AND other.space_id=b.space_id) AS inquiry_event_count`:'';
  const {results}=await env.DB.prepare(`SELECT b.booking_code,b.date AS event_date${identityColumns}${detailColumns}
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

const financialFields=s=>({amount:s.amount,received:s.received,refunded:s.refunded,netReceived:s.net,balance:s.balance,
  review_required:!!s.review_required,excessPaid:s.refund_due,overRefunded:s.over_refunded||0});

function bookingScope(url) {
  const q=url.searchParams,today=kstToday(),[year,month]=today.slice(0,7).split('-').map(Number);
  const from=q.get('from')??today.slice(0,7)+'-01',to=q.get('to')??new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const space=q.get('space')??'';
  if(!isDate(from)||!isDate(to)||from>to||Date.parse(to)-Date.parse(from)>365*864e5)
    return {error:err('조회 기간을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.')};
  if(space&&space!=='unassigned'&&!Object.hasOwn(SPACES,space))return {error:err('조회 조건을 확인해 주세요.')};
  return {from,to,space};
}
export async function revenueBookingsAdmin({env,url,method,operationalBookingSql='1=1'}) {
  if(method!=='GET')return err('지원하지 않는 요청입니다.',405);
  const scope=bookingScope(url);if(scope.error)return scope.error;
  const {from,to,space}=scope,q=url.searchParams,metric=q.get('metric')??'booked',page=Number(q.get('page')??1),pageSize=50;
  if(!['booked','received','balance'].includes(metric)||!Number.isSafeInteger(page)||page<1||page>100000)
    return err('조회 조건을 확인해 주세요.');
  const options={env,from,to,space,operationalBookingSql},cohort=await bookingCohort(options,true),summary=summarize(cohort,options);
  const selected=cohort.filter(({settlement:s})=>metric==='booked'||(metric==='received'?(s.received>0||s.refunded>0):s.balance>0));
  const total={count:selected.length,amount:summary[metric==='received'?'netReceived':metric],
    unknownCount:metric==='booked'?summary.amountUnknownCount:metric==='balance'?summary.balanceUnknownCount:0};
  const items=selected.slice((page-1)*pageSize,page*pageSize).map(row=>{
    const s=row.settlement;
    return {booking_code:row.booking_code,customer_name:row.customer_name,date:row.event_date,space_id:row.space_id,
      status:s.booking_status,start_h:row.start_h,end_h:row.end_h,slot:row.slot,...financialFields(s)};
  });
  return json({ok:true,metric,summary,total,items,detailCount:selected.length,page,pageSize},200,{'cache-control':'no-store'});
}

function savedData(raw) {try {const value=JSON.parse(raw||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
const savedAmount=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
const text=value=>typeof value==='string'?value:'';
const optionLabels={manager:'현장 매니저',cleaning:'뒷정리·청소',disposable:'1회용 세트',banner:'현수막',xbanner:'X배너'};
function savedOptions(options) {
  if(!options||typeof options!=='object')return [];
  return Object.entries(optionLabels).filter(([key])=>options[key]).map(([key,label])=>{
    const value=options[key];
    return label+(key==='manager'&&value&&typeof value==='object'?' '+(savedAmount(value.count)??1)+'명 × '+(savedAmount(value.hours)??'미정')+'시간':'');
  });
}
const serviceLabels={catering:'출장뷔페',reception:'테이블·박스 케이터링',cocktail:'출장 칵테일'};
function serviceSnapshot(kind,value,amount) {
  return {kind,label:serviceLabels[kind],status:text(value.status)||'pending',summary:text(value.summary)||text(value.course_name)||'',amount:savedAmount(amount)};
}

export async function revenueBookingDetailAdmin({env,url,method,bookingCode,operationalBookingSql='1=1'}) {
  if(method!=='GET')return err('지원하지 않는 요청입니다.',405);
  const scope=bookingScope(url);if(scope.error)return scope.error;
  if(typeof bookingCode!=='string'||!(/^[A-Z0-9-]{1,80}$/).test(bookingCode))return err('예약을 찾을 수 없습니다.',404,'NOT_FOUND');
  const [row]=await bookingCohort({env,...scope,bookingCode,operationalBookingSql},'detail');
  if(!row)return err('예약을 찾을 수 없습니다.',404,'NOT_FOUND');
  const s=row.settlement,ref=row.inquiry_ref||'';
  const inquiryRow=ref?await env.DB.prepare('SELECT ref,space_id,status,email,event_date,data,memo FROM inquiries WHERE ref=?').bind(ref).first():null;
  const d=savedData(inquiryRow?.data);
  const inquiry=inquiryRow?{ref:inquiryRow.ref,status:inquiryRow.status,org:text(d.org),email:text(d.email)||inquiryRow.email||'',
    purpose:text(d.purpose),message:text(d.message),estimate:text(d.estimate),memo:inquiryRow.memo||'',
    needs:Array.isArray(d.needs)?d.needs.filter(value=>typeof value==='string'):[],options:savedOptions(d.options)}:null;
  // An inquiry may cover several dates/spaces. A saved quote must belong to the
  // clicked reservation; an undated legacy quote is safe only for a sole booking.
  const quoteRow=inquiry?await env.DB.prepare(`SELECT q.quote_no,q.event_date,q.created_at,q.total,q.data FROM quotes q
    WHERE q.inquiry_ref=? AND (q.event_date=? OR (q.event_date IS NULL AND ?=1))
      AND COALESCE(json_extract(CASE WHEN json_valid(q.data) THEN q.data ELSE '{}' END,'$.input.space'),?)=?
    ORDER BY q.id DESC LIMIT 1`).bind(ref,row.event_date,row.inquiry_booking_count,row.space_id,row.space_id).first():null;
  const q=savedData(quoteRow?.data),quoteLines=rows=>Array.isArray(rows)?rows.filter(line=>line&&typeof line==='object').map(line=>({label:text(line.label),amount:savedAmount(line.amount)})):[];
  const quote=quoteRow?{quote_no:quoteRow.quote_no,event_date:quoteRow.event_date,created_at:quoteRow.created_at,total:quoteRow.total,
    subtotal:savedAmount(q.subtotal),discount:savedAmount(q.discount),lines:quoteLines(q.lines),extras:quoteLines(q.extras)}:null;
  const services=new Map();
  for(const extra of Array.isArray(q.extras)?q.extras:[])if(extra&&Object.hasOwn(serviceLabels,extra.kind))
    services.set(extra.kind,serviceSnapshot(extra.kind,{summary:extra.label,status:extra[extra.kind]?.status},extra.amount));
  if(inquiry&&(row.inquiry_booking_count===1||(inquiryRow.event_date===row.event_date&&inquiryRow.space_id===row.space_id&&row.inquiry_event_count===1))) {
    for(const kind of Object.keys(serviceLabels)) {
      const value=d[kind];
      if(value&&typeof value==='object'&&!Array.isArray(value)&&!value.removed)
        services.set(kind,serviceSnapshot(kind,value,kind==='cocktail'&&value.vat_excluded!==true?value.price:value.total));
    }
  }
  const catering=await env.DB.prepare(`SELECT status,total,data FROM catering_orders WHERE booking_code=? OR
    (?<>'' AND COALESCE(booking_code,'')='' AND inquiry_ref=? AND event_date=? AND space_id=?)
    ORDER BY CASE WHEN booking_code=? THEN 0 ELSE 1 END,id DESC LIMIT 1`)
    .bind(bookingCode,ref,ref,row.event_date,row.space_id,bookingCode).first();
  if(catering)services.set('catering',serviceSnapshot('catering',{...savedData(catering.data),status:catering.status},catering.total));
  return json({ok:true,scope:{...scope,statuses,filters:'period-space'},booking:{booking_code:row.booking_code,customer_name:row.customer_name,
    date:row.event_date,space_id:row.space_id,status:s.booking_status,start_h:row.start_h,end_h:row.end_h,slot:row.slot,
    headcount:row.headcount,phone:row.phone,phone2:row.phone2,inquiry_ref:ref,memo:row.memo||'',created_at:row.created_at,updated_at:row.updated_at},
    settlement:financialFields(s),inquiry,quote,services:[...services.values()]},200,{'cache-control':'no-store'});
}
