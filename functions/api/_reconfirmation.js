import {json,err,readJson,str,num,isDate,now,randomToken,log} from './_lib.js';
import {S,settlementFor,settlementRevisionSql} from './_settlement.js';
import {bookingAmountSql} from './_amounts.js';
import {bookingClashes,conflictResponse} from './_admin_booking.js';
import {confirmedGuide} from './_guide_messages.js';
const parse=x=>{try{return JSON.parse(x);}catch{return null;}};
const hour=v=>v==null||v===''?null:Number.isInteger(Number(v))&&Number(v)>=0&&Number(v)<=36?Number(v):NaN;
const one=(env,code)=>env.DB.prepare(`SELECT b.*,${bookingAmountSql()} AS effective_amount FROM bookings b WHERE booking_code=?`).bind(code).first();
const stale=()=>err('예약·수납·취소 정산이 바뀌었습니다. 최신 금액을 확인한 뒤 다시 확정해 주세요.',409,'PAYMENT_CHANGED');
export async function reconfirmationAdmin({env,request,path,method,waitUntil}){
 const m=path.match(/^bookings\/([A-Z0-9-]+)\/reconfirm$/);if(!m)return null;
 if(method==='POST')return reconfirmBooking(env,m[1],await readJson(request),waitUntil);
 if(method!=='GET')return err('지원하지 않는 요청입니다.',405);
 const row=await one(env,m[1]);if(!row)return err('예약을 찾을 수 없습니다.',404);
 const settlement=await settlementFor(env,m[1]),history=(await env.DB.prepare('SELECT id,snapshot,created_at FROM booking_reconfirmations WHERE booking_code=? ORDER BY id DESC LIMIT 30').bind(m[1]).all()).results||[];
 return json({ok:true,booking:{code:row.booking_code,inquiry_ref:row.inquiry_ref||'',space_id:row.space_id,name:row.customer_name,phone:row.phone,date:row.date,headcount:row.headcount,start_h:row.start_h,end_h:row.end_h,memo:row.memo||'',status:row.status,amount:row.effective_amount},settlement,preview:S.calculate({amount:row.effective_amount,received:settlement.received,refunded:settlement.refunded,reconfirmation:{at:now()}}),history:history.map(h=>({...h,snapshot:parse(h.snapshot)}))});
}
export async function reconfirmBooking(env,code,d,waitUntil,{legacy=false}={}){
 const row=await one(env,code);if(!row)return err('예약을 찾을 수 없습니다.',404);
 const settlement=await settlementFor(env,code),requestId=str(d.request_id,80)|| (legacy?randomToken():'');
 if(!/^[A-Za-z0-9_-]{8,80}$/.test(requestId))return err('재확정 요청번호를 확인해 주세요.');
 const old=await env.DB.prepare('SELECT id,signature FROM booking_reconfirmations WHERE booking_code=? AND request_id=?').bind(code,requestId).first();
 const amount=d.amount===undefined?row.effective_amount:d.amount==null||d.amount===''?null:Number(d.amount),date=d.date===undefined?row.date:str(d.date,10),start=d.start_h===undefined?row.start_h:hour(d.start_h),end=d.end_h===undefined?row.end_h:hour(d.end_h),people=d.headcount===undefined||d.headcount===''?row.headcount:Number(d.headcount),memo=d.memo===undefined?row.memo||'':str(d.memo,2000);
 if(!isDate(date)||amount!=null&&(!Number.isSafeInteger(amount)||amount<0||amount>1e9)||Number.isNaN(start)||Number.isNaN(end)||((start==null)!==(end==null))||start!=null&&end<=start||people!=null&&(!Number.isInteger(people)||people<1||people>1000))return err('재확정할 이용일·시간·인원·금액을 확인해 주세요.');
 const signature=JSON.stringify({date,start_h:start,end_h:end,headcount:people,amount,memo,block_calendar:d.block_calendar===true});
 if(old){if(old.signature!==signature)return err('다른 재확정에 사용한 요청번호입니다.',409,'PAYMENT_CONFLICT');return json({ok:true,duplicate:true,reconfirmed:true,booking_code:code,date,settlement});}
 if(row.status!=='cancelled')return err('이미 확정되었거나 취소 상태가 아닌 예약입니다. 최신 예약을 확인해 주세요.',409,'ALREADY_BOOKED');
 const expected=d.expected_revision??(legacy?settlement.revision:null);if(expected!==settlement.revision)return stale();
 if(row.inquiry_ref){const active=await env.DB.prepare("SELECT booking_code FROM bookings WHERE inquiry_ref=? AND booking_code<>? AND status<>'cancelled' LIMIT 1").bind(row.inquiry_ref,code).first();if(active)return err('이 문의에 다른 확정 예약('+active.booking_code+')이 있습니다. 연결 예약을 먼저 확인해 주세요.',409,'ALREADY_BOOKED');}
 const clashes=await bookingClashes(env,row.space_id,date,start,end,[code]);if(clashes.length&&!d.force)return conflictResponse(clashes);
 if(d.block_calendar===true){const block=await env.DB.prepare('SELECT memo FROM calendar_blocks WHERE space_id=? AND date=?').bind(row.space_id,date).first();if(block&&block.memo!=='예약 '+code)return err('다른 마감·임시 확보 표시가 있습니다. 달력에서 확인해 주세요.',409,'DATE_BLOCKED');}
 const cancellation=await env.DB.prepare('SELECT s.document,r.terms FROM booking_cancellation_state s JOIN booking_cancellation_revisions r ON r.id=s.revision WHERE s.booking_code=?').bind(code).first();
 const previousDoc=parse(cancellation?.document)||parse(row.confirm_doc)||{},showAmount=previousDoc.show_amount!==false;
 const snapshot={previous_cancellation:settlement.cancellation||null,received:settlement.received,refunded:settlement.refunded,net:settlement.net,previous_amount:row.effective_amount,amount,date,start_h:start,end_h:end,headcount:people};
 const t=now(),token=randomToken(),gate='EXISTS(SELECT 1 FROM booking_reconfirmations WHERE booking_code=? AND request_id=? AND processing_token=?)',args=[code,requestId,token];
 const statements=[
  env.DB.prepare(`INSERT INTO booking_reconfirmations(booking_code,request_id,signature,snapshot,show_amount,created_at,processing_token) SELECT booking_code,?,?,?,?,?,? FROM bookings b WHERE booking_code=? AND status='cancelled' AND ${settlementRevisionSql()}=?
    AND (b.inquiry_ref IS NULL OR NOT EXISTS(SELECT 1 FROM bookings other WHERE other.inquiry_ref=b.inquiry_ref AND other.booking_code<>b.booking_code AND other.status<>'cancelled'))
    AND (?=1 OR NOT EXISTS(SELECT 1 FROM bookings other WHERE other.space_id=b.space_id AND other.booking_code<>b.booking_code AND other.status='confirmed' AND other.date BETWEEN date(?,'-1 day') AND date(?,'+1 day') AND (CASE WHEN ? IS NULL OR ? IS NULL OR other.start_h IS NULL OR other.end_h IS NULL THEN other.date=? ELSE ?<other.end_h+(julianday(other.date)-julianday(?))*24 AND ?>other.start_h+(julianday(other.date)-julianday(?))*24 END)))
    AND (?=0 OR NOT EXISTS(SELECT 1 FROM calendar_blocks c WHERE c.space_id=b.space_id AND c.date=? AND COALESCE(c.memo,'')<>?))`).bind(requestId,signature,JSON.stringify(snapshot),showAmount?1:0,t,token,code,expected,d.force?1:0,date,date,start,end,date,start,date,end,date,d.block_calendar?1:0,date,'예약 '+code),
  env.DB.prepare(`UPDATE bookings SET status='confirmed',date=?,start_h=?,end_h=?,slot=?,headcount=?,amount=?,memo=?,confirm_doc=NULL,updated_at=? WHERE booking_code=? AND ${gate}`).bind(date,start,end,start===10&&end===17?'pkg-day':start===10&&end===24?'pkg-allday':start===18&&end===31?'pkg-allnight':'custom',people,amount,memo,t,code,...args),
  env.DB.prepare(`DELETE FROM booking_cancellation_state WHERE booking_code=? AND ${gate}`).bind(code,...args),
  env.DB.prepare(`DELETE FROM calendar_blocks WHERE memo=? AND date<>? AND ${gate}`).bind('예약 '+code,date,...args)
 ];
 if(row.inquiry_ref)statements.push(env.DB.prepare(`UPDATE inquiries SET status='예약 확정',event_date=?,headcount=?,data=json_set(data,'$.date',?,'$.headcount',?,'$.start_h',?,'$.end_h',?,'$.t_start',?,'$.t_end',?,'$.total',?,'$.amount_override',json('true')),updated_at=? WHERE ref=? AND ${gate}`).bind(date,people,date,people,start,end,start==null?'':String(start%24).padStart(2,'0')+':00',end==null?'':String(end%24).padStart(2,'0')+':00',amount,t,row.inquiry_ref,...args));
 if(d.block_calendar===true)statements.push(env.DB.prepare(`INSERT INTO calendar_blocks(space_id,date,state,memo) SELECT ?,?,'full',? WHERE ${gate} ON CONFLICT(space_id,date) DO UPDATE SET state=excluded.state,memo=excluded.memo`).bind(row.space_id,date,'예약 '+code,...args));
 await env.DB.batch(statements);
 const saved=await env.DB.prepare('SELECT id,signature,processing_token FROM booking_reconfirmations WHERE booking_code=? AND request_id=?').bind(code,requestId).first();if(!saved)return stale();if(saved.signature!==signature)return err('다른 재확정에 사용한 요청번호입니다.',409,'PAYMENT_CONFLICT');
 if(saved.processing_token!==token)return json({ok:true,duplicate:true,reconfirmed:true,booking_code:code,date,settlement:await settlementFor(env,code)});
 await log(env,'booking.reconfirmed',code,'admin',{revision:saved.id,previous_fee:settlement.cancellation?.fee||0,amount,received:settlement.received,refunded:settlement.refunded});
 if(row.inquiry_ref)await log(env,'inquiry.reconfirmed',row.inquiry_ref,'admin',{booking_code:code,amount});
 await confirmedGuide(env,code,waitUntil);
 return json({ok:true,reconfirmed:true,booking_code:code,date,settlement:await settlementFor(env,code)});
}
