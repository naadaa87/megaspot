// Refundable deposit deadlines are independent of rental balance deadlines.
const day=at=>new Date(at+9*3600000).toISOString().slice(0,10);
const shifted=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function depositConfirmedDay(b){
 if(/^\d{4}-\d{2}-\d{2}/.test(b?.confirmed_day||''))return b.confirmed_day.slice(0,10);
 const raw=String(b?.created_at||'').replace(' ','T'),stamp=Date.parse(raw+(/Z$|[+]\d\d:\d\d$/.test(raw)?'':raw.includes('T')?'Z':'T00:00:00Z'));
 return Number.isFinite(stamp)?day(stamp):null;
}
export function depositDueDate(b){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(b?.date||'')||!Number.isFinite(Date.parse(b.date+'T00:00:00Z')))return null;
 const due=shifted(b.date,-3),confirmed=depositConfirmedDay(b);return confirmed&&confirmed>due?confirmed:due;
}
export function depositPaymentWindow(b,at=Date.now()){
 const due=depositDueDate(b),today=day(at),confirmed=depositConfirmedDay(b);
 return !!due&&(!confirmed||confirmed<today)&&today>=shifted(due,-1)&&today<=due;
}
export const depositConfirmedSql=(alias='b')=>`COALESCE((SELECT CASE WHEN j.confirm_version>0 THEN substr(j.confirmed_at,1,10) ELSE date(j.confirmed_at,'+9 hours') END FROM booking_journey_state j WHERE j.booking_code=${alias}.booking_code),date(${alias}.created_at,'+9 hours'))`;
export const depositDueSql=(alias='b')=>`max(date(${alias}.date,'-3 days'),COALESCE(${depositConfirmedSql(alias)},date(${alias}.date,'-3 days')))`;
