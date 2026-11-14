import {json,err,now,readJson,sha256,SPACES,log} from './_lib.js';
import {bookingPhone2Sql,contactPhones} from './_contacts.js';
import {guidePhone,aligoProvider} from './_guide_messages.js';
import {readNotificationContent,saveNotificationContent,noticeButtons} from './_notification_content.js';
import {eventTime} from './_deposit_refunds.js';
import {portalGuideMessage} from './_guide_portal.js';
import {settlementFor} from './_settlement.js';
import {paymentSchedule,dayAt,shiftDay} from './_booking_payment_schedule.js';
import {journeyContext} from './_booking_journey.js';
import {JOURNEY_TEMPLATES} from './_booking_journey_templates.js';
import {CUSTOMER_ALIMTALK} from './_customer_alimtalk_templates.js';
import {depositConsoleContext,noticeObsolete,depositNoticeVariables,depositNoticeRender} from './_deposit_notifications.js';
import {DEPOSIT_TEMPLATES} from './_deposit_templates.js';
import {depositPaymentWindow,depositDueDate} from './_deposit_due.js';
const active=['queued','sending','accepted','unknown','review'];
const labels={booking_confirmed:'예약 확정 · 통합 안내',balance_reminder:'이용료 잔금 안내',rental_paid:'잔금 납부 완료',booking_arrival:'입실·주차 안내',payment:'보증금 입금 안내',account:'환급 계좌 등록 안내',refunded:'보증금 환급 완료',inquiry:'문의 접수',reservation_request:'예약 신청 접수',payment_review:'결제 후 확정 보류',booking_cancelled:'예약 취소',rental_refund:'이용료 환불',parking_partial_refund:'주차권 부분 환불',parking_paid:'주차권 결제 완료',parking_arrival_received:'주차권 입차 요청 접수',parking_applied:'주차권 등록 완료',parking_issue:'주차권 등록 확인 필요',parking_cancel_requested:'주차권 취소 문의 접수',parking_refunded:'주차권 전체 환불',parking_partially_refunded:'주차권 부분 환불'};
const parse=s=>{try{return JSON.parse(s||'{}');}catch{return {};}};
const placeholders=items=>items.map(()=>'?').join(',');
const summary=r=>({id:r.id,engine:r.engine,kind:r.kind,label:labels[r.kind]||r.kind,audience:r.audience||'customer',receiver:r.receiver||'',status:r.status,error:r.error||'',occurred_at:r.occurred_at||r.created_at,updated_at:r.updated_at,channel:/대체 문자.*(성공|완료)|문자 대체.*(성공|완료)/.test(r.error||'')?'sms':r.provider_mid?.startsWith('at:')||r.engine!=='transaction'?'alimtalk':r.provider_mid?'sms':''});
async function context(env,code){
 const b=await env.DB.prepare(`SELECT b.*,${bookingPhone2Sql()} AS phone2,j.confirm_version,j.confirmed_at,j.amount_visible,j.paid_state,j.paid_cycle,COALESCE((SELECT revision FROM booking_guide_state WHERE booking_code=b.booking_code),0) AS guide_revision,(SELECT COUNT(*) FROM booking_payment_current WHERE booking_code=b.booking_code AND kind='receipt' AND state='active')+(SELECT COUNT(*) FROM orders WHERE booking_code=b.booking_code AND test=0 AND status IN ('paid','refunded')) AS receipt_count FROM bookings b LEFT JOIN booking_journey_state j ON j.booking_code=b.booking_code WHERE b.booking_code=?`).bind(code).first();if(!b)return null;
 const [settlement,schedule,deposit,transactions,guides,parking,enabled]=await Promise.all([
  settlementFor(env,code),paymentSchedule(env,b),depositConsoleContext(env,code),
  env.DB.prepare("SELECT * FROM transaction_notifications WHERE booking_code=? OR ref=? ORDER BY id DESC").bind(code,b.inquiry_ref||code).all(),
  env.DB.prepare("SELECT *,snapshot AS payload FROM booking_guide_messages WHERE booking_code=? AND mode='live' ORDER BY created_at DESC,rowid DESC").bind(code).all(),
  env.DB.prepare("SELECT n.*,o.buyer_phone AS receiver FROM parking_notifications n JOIN orders o ON o.oid=n.oid WHERE o.booking_code=? AND n.mode='live' ORDER BY n.id DESC").bind(code).all(),
  env.DB.prepare("SELECT json_extract(value,'$.enabled') AS enabled FROM settings WHERE key='booking_journey'").first()
 ]);
 const deposits=(await env.DB.prepare("SELECT * FROM deposit_notifications WHERE booking_code=? AND mode='live' ORDER BY id DESC").bind(code).all()).results||[];
 const phones=contactPhones(b),hashes=Object.fromEntries(await Promise.all(phones.map(async p=>[await sha256(p),p])));
 const history=[...(transactions.results||[]).map(r=>({...r,engine:'transaction'})),...deposits.map(r=>({...r,engine:'deposit',receiver:hashes[r.phone_hash]||guidePhone(parse(r.payload).delivery_phone||parse(r.payload).phone)})),...(guides.results||[]).map(r=>({...r,kind:'booking_arrival',engine:'guide',receiver:guidePhone(parse(r.snapshot).phone)})),...(parking.results||[]).map(r=>({...r,engine:'parking',kind:'parking_'+r.kind}))];
 return {b,settlement,schedule,deposit,history,phones,enabled:enabled?.enabled===1&&env.ALIGO_LIVE_ENABLED==='true'&&env.ALIGO_RELAY_URL==='https://relay.naranhistory.com/megaspot/aligo'&&String(env.ALIGO_RELAY_SECRET||'').length>=32};
}
function payload(b){return {name:b.customer_name,phone:b.phone,date:b.date,space:b.space_id,start:b.start_h,end:b.end_h,slot:b.slot,amount:b.deposit_amount,deduction:b.deduction||0,refund:b.paid_amount,completion:b.completion_id,completed_at:b.completed_at};}
async function steps(env,c){
 const {b,settlement:s,schedule,deposit,history,phones}=c,today=dayAt(Date.now()),hour=new Date(Date.now()+9*3600000).getUTCHours();
 const v=b.confirm_version??0,base='journey-',keys={booking_confirmed:base+'confirm:'+b.booking_code+':'+v,balance_reminder:base+'balance:'+b.booking_code+':'+v+':'+schedule.due_date,rental_paid:base+'paid:'+b.booking_code+':'+b.paid_cycle,booking_arrival:base+'arrival:'+b.booking_code+':'+v+':'+b.date};
 const confirmed=b.status==='confirmed'&&b.date>=today,hidden=b.amount_visible===0||parse(b.confirm_doc).show_amount===false;
 const reasons={booking_confirmed:!confirmed?'이용 전 확정 예약에서 보낼 수 있습니다.':'',balance_reminder:!confirmed?'이용 전 확정 예약에서 보낼 수 있습니다.':hidden||s.amount==null?'이용료 공개·확정이 필요합니다.':!(s.balance>0)?'남은 이용료가 없어 안내가 필요하지 않습니다.':today<shiftDay(schedule.due_date,-1)?'납부 기한 전날부터 발송 예정입니다.':today>schedule.due_date?'납부 기한이 지났습니다. 입금 내역과 기한을 확인해 주세요.':b.confirmed_at?.slice(0,10)>=today?'확정 당일은 통합 안내만 발송합니다.':'',rental_paid:!confirmed?'이용 전 확정 예약에서 보낼 수 있습니다.':hidden||s.amount==null?'이용료 공개·확정이 필요합니다.':s.balance!==0||s.net<=0||s.over_refunded?'이용료 전액 납부 확인이 필요합니다.':!(b.receipt_count>1||history.some(r=>r.engine==='transaction'&&r.kind==='rental_paid'&&r.event_key===keys.rental_paid))?'처음부터 전액 납부한 예약은 통합 안내로 갈음합니다.':'',booking_arrival:!confirmed?'이용 전 확정 예약에서 보낼 수 있습니다.':b.date!==shiftDay(today,1)?'이용 전날 발송 예정입니다.':b.confirmed_at?.slice(0,10)>=today?'확정 당일은 통합 안내만 발송합니다.':''};
 const result=[];
 for(const kind of [...Object.keys(keys),'payment','account','refunded']){
  const engine=Object.hasOwn(keys,kind)?'transaction':'deposit',db=deposit.b,key=keys[kind];let reason=reasons[kind]||'';
  if(engine==='deposit'){
   if(!db)reason='보증금 정보를 확인해 주세요.';
   else{const e={kind,payload:JSON.stringify(payload(db)),occurred_at:now()};reason=noticeObsolete(db,e,Date.now(),kind==='payment');if(kind==='account'&&!db.deposit_paid)reason='보증금 입금 확인 후 안내할 수 있습니다.';if(kind==='refunded'&&db.refund_state!=='completed')reason='보증금 환급 완료 처리 후 자동 안내합니다.';if(!reason&&kind==='account'&&Number(db.deposit_amount)-Number(db.deduction||0)<=0)reason='전액 차감되어 환급 계좌 등록이 필요하지 않습니다.';if(!reason&&kind==='payment'&&!depositPaymentWindow(db))reason='보증금 납부 기한 전날부터 미납 고객에게 발송합니다.';if(!reason&&!deposit.ready[kind])reason='보증금 알림의 연결·승인·시험 수신 설정을 확인해 주세요.';}
  }
  if(engine==='transaction'&&!reason&&!c.enabled)reason='통합 알림 자동 발송 설정이 중지되어 있습니다.';
  if(kind!=='booking_confirmed'&&!reason&&(hour<9||hour>=21))reason='발송 가능 시간은 오전 9시부터 오후 9시 전까지입니다.';
  const recipients=phones.map(phone=>{
   const matching=history.filter(r=>r.audience!=='admin'&&r.kind===kind&&guidePhone(r.receiver)===phone&&(engine==='deposit'||r.engine==='guide'&&kind==='booking_arrival'&&r.actor==='admin'&&Date.parse(r.created_at.replace(' ','T')+'Z')>=Date.parse(shiftDay(b.date,-1)+'T00:00:00+09:00')&&parse(r.snapshot).date===b.date&&Number(parse(r.snapshot).revision||0)===Number(b.guide_revision||0)||r.engine==='transaction'&&r.event_key===key));
   const blocked=matching.find(r=>active.includes(r.status)),delivered=matching.find(r=>r.status==='delivered'),last=blocked||delivered||matching[0];
   const why=blocked?blocked.status==='unknown'?'접수 여부가 불명확해 재발송을 보류합니다.':blocked.status==='queued'&&last.error?last.error:'기존 발송이 대기·처리 중입니다.':delivered?'이미 수신 성공했습니다.':reason;
   return {phone,status:last?.status||(reason?((kind==='balance_reminder'&&!(s.balance>0))||(kind==='rental_paid'&&reason.startsWith('처음부터'))||(kind==='payment'&&db?.deposit_paid)||(kind==='account'&&db?.account_cipher)?'not_required':reason.includes('전날')?'scheduled':'blocked'):'unsent'),at:last?.updated_at||null,reason:why||'',can_send:!why,last_id:last?.id||null,last_engine:last?.engine||null};
  });
  const can=recipients.filter(r=>r.can_send);
  result.push({action_key:kind,kind,engine,label:labels[kind],event_key:key||'',due:kind==='balance_reminder'?schedule.due_date:kind==='payment'?depositDueDate(db):kind==='booking_arrival'?shiftDay(b.date,-1):'',reason:phones.length?reason:'알림톡을 받을 휴대폰 번호를 등록해 주세요.',recipients,can_send:can.length>0});
 }
 for(const row of history.filter(r=>r.engine==='transaction'&&r.audience==='customer'&&r.status==='failed'&&!Object.hasOwn(keys,r.kind)&&CUSTOMER_ALIMTALK[r.kind])){
  let reason=phones.includes(guidePhone(row.receiver))?'':'수신번호가 변경되어 재발송할 수 없습니다.';
  if(!reason&&!c.enabled)reason='고객 알림 발송 설정을 확인해 주세요.';
  if(!reason&&row.kind==='booking_cancelled'){
   const version=await env.DB.prepare('SELECT COALESCE(MAX(id),0) n FROM booking_reconfirmations WHERE booking_code=?').bind(b.booking_code).first();
   if(b.status!=='cancelled'||row.event_key!=='cancel:'+b.booking_code+':'+version.n)reason='현재 예약의 취소 내역과 일치하지 않습니다.';
  }
  if(!reason&&row.kind==='payment_review'&&!await env.DB.prepare("SELECT 1 FROM orders o JOIN bookings b ON b.booking_code=o.booking_code WHERE o.oid=? AND o.status='paid' AND b.status='payment_review'").bind(row.ref).first())reason='결제 후 확정 보류 상태가 아닙니다.';
  if(!reason&&row.event_key.startsWith('manual-refund:')){const entry=await env.DB.prepare("SELECT amount FROM booking_payment_current WHERE id=? AND kind='refund' AND state='active'").bind(Number(row.event_key.slice(14))).first();if(!entry||entry.amount!==row.amount)reason='원래 환불 내역이 변경되었습니다.';}
  const others=history.some(r=>r.engine==='transaction'&&r.id!==row.id&&r.event_key===row.event_key&&guidePhone(r.receiver)===guidePhone(row.receiver)&&(['delivered',...active].includes(r.status)));
  if(others)reason='같은 알림이 이미 처리됐거나 결과 확인 중입니다.';
  result.push({action_key:'event:'+row.id,kind:row.kind,engine:'transaction',label:labels[row.kind]+' · 실패 재시도',event_key:row.event_key,event_row:row,reason,recipients:[{phone:guidePhone(row.receiver),status:'failed',at:row.updated_at,reason:reason||'실패한 기존 안내만 다시 요청합니다.',can_send:!reason,last_id:row.id,last_engine:'transaction'}],can_send:!reason});
 }
 return result;
}
async function fingerprint(c,kind){return sha256(JSON.stringify([kind,{...c.b,confirm_doc:undefined},c.settlement,c.schedule,c.deposit.hash,c.deposit.ready,c.enabled,JOURNEY_TEMPLATES,c.history.map(r=>[r.engine,r.id,r.kind,r.status,r.receiver,r.updated_at,r.error,r.event_key])]));}
function brief(c){const b=c.b;return {booking_code:b.booking_code,name:b.customer_name,space_id:b.space_id,space:SPACES[b.space_id]||b.space_id,date:b.date,status:b.status,phones:c.phones,balance:c.settlement.balance,deposit_paid:!!c.deposit.b?.deposit_paid};}
function currentContent(c,kind){
 if(kind.startsWith('parking_'))return null;
 const template=JOURNEY_TEMPLATES[kind]||DEPOSIT_TEMPLATES[kind]||CUSTOMER_ALIMTALK[kind];if(!template)return null;
 const hours=eventTime(c.b)?.hours||[c.b.start_h,c.b.end_h],clock=h=>h==null?'확인 필요':(h>=24?'다음날 ':'')+String(Math.floor(h%24)).padStart(2,'0')+':'+String(Math.round(h%1*60)).padStart(2,'0');
 const vars={고객명:c.b.customer_name,공간명:SPACES[c.b.space_id],이용일:c.b.date,이용시간:hours.map(clock).join('~'),예약번호:c.b.booking_code,잔금:Number(c.settlement.balance).toLocaleString('ko-KR'),수납액:Number(c.settlement.net).toLocaleString('ko-KR'),납부기한:c.schedule.due_date,번호:c.b.booking_code,금액:'처리 시 확정'};
 if(DEPOSIT_TEMPLATES[kind]&&c.deposit.b)Object.assign(vars,depositNoticeVariables(c.deposit.b,{payload:JSON.stringify(payload(c.deposit.b)),occurred_at:now()},'예약자 전용 코드'));
 return {source:'current',message:kind==='booking_confirmed'?portalGuideMessage(c.b,hours):template.content.replace(/#\{([^}]+)\}/g,(_,k)=>vars[k]??'발송 시 확정'),buttons:template.buttons.map(b=>({...b,linkMo:/#\{/.test(b.linkMo)?'':b.linkMo,linkPc:/#\{/.test(b.linkPc)?'':b.linkPc})),note:'현재 예약·납부 정보로 구성한 안내 예시입니다. 실제 과거 수신 내용과 다를 수 있으며, 조회만으로 발송하거나 전용 링크를 새로 만들지 않습니다.'};
}
async function historicalContent(env,row){
 const saved=await readNotificationContent(env,row.engine,row.id);if(saved)return {...saved,source:'saved'};
 const mid=/^at:[^:]+:(\d+)$/.exec(row.provider_mid||'')?.[1]||/^(?:fallback:)?(\d+)$/.exec(row.provider_mid||'')?.[1];
 if(mid&&row.receiver){try{
  const sms=row.engine==='transaction'&&!String(row.provider_mid).startsWith('at:');
  const response=await aligoProvider(env,sms?'sms/detail':'history/detail',sms?{mid,page_size:'50'}:{mid,limit:'50'});
  const expected=/^at:([^:]+):/.exec(row.provider_mid||'')?.[1];
  const found=(response.list||[]).find(r=>guidePhone(r.phone||r.receiver)===guidePhone(row.receiver)&&(sms||r.type==='AT'&&r.senderKey===env.ALIGO_SENDER_KEY&&(!expected||r.tpl_code===expected)));
  const message=found?.message||found?.msg;if(message){const content={receiver:row.receiver,message,buttons:noticeButtons(found.button_json||found.buttons),template_code:found.tpl_code||'',channel:sms?'sms':'alimtalk',requested_at:row.occurred_at||row.created_at};await saveNotificationContent(env,row.engine,row.id,content);return {...content,source:'provider'};}
 }catch{ /* An unavailable historical body never becomes a fabricated current receipt. */ }}
 const snap=parse(row.snapshot);if(row.engine==='guide'&&snap.message)return {source:'snapshot',receiver:row.receiver,message:snap.message,buttons:noticeButtons(snap.buttons||snap.button),requested_at:row.created_at,note:'기존 발송 당시 저장된 본문입니다. 당시 버튼 정보가 없는 경우 버튼은 표시하지 않습니다.'};
 return {source:'unavailable',message:'',buttons:[],note:'이 과거 발송의 본문·버튼 원문을 저장하지 않았거나 공급사에서 조회할 수 없습니다. 현재 안내 예시는 아래에서 별도로 확인할 수 있습니다.'};
}
export async function bookingNotificationsAdmin({env,request,url,path,method}){
 if(path==='booking-notifications'&&method==='GET'){
  const calendar=url.searchParams.get('calendar')==='1';let month=url.searchParams.get('month')||'';
  const q=String(url.searchParams.get('q')||'').trim().slice(0,100),space=url.searchParams.get('space')||'',period=calendar?'all':url.searchParams.get('period')||'upcoming',page=Math.max(0,Math.min(10000,Number(url.searchParams.get('page'))||0));
  const where=['1'],args=[];if(q){where.push("(b.customer_name LIKE ? ESCAPE '\\' OR b.booking_code LIKE ? ESCAPE '\\' OR replace(b.phone,'-','') LIKE ? ESCAPE '\\')");const value='%'+q.replace(/[\\%_]/g,'\\$&')+'%';args.push(value,value,value.replace(/-/g,''));}if(space){where.push('b.space_id=?');args.push(space);}if(period==='upcoming'){where.push("b.date>=? AND b.status<>'cancelled'");args.push(dayAt(Date.now()));}else if(period==='past'){where.push('b.date<?');args.push(dayAt(Date.now()));}
  if(calendar){
   if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return err('조회할 월을 확인해 주세요.');
   if(!month&&q){const first=await env.DB.prepare(`SELECT COALESCE(MIN(CASE WHEN b.date>=? THEN b.date END),MAX(b.date)) date FROM bookings b WHERE ${where.join(' AND ')}`).bind(dayAt(Date.now()),...args).first();month=first?.date?.slice(0,7)||'';}
   month=month||dayAt(Date.now()).slice(0,7);const [year,m]=month.split('-').map(Number),next=new Date(Date.UTC(year,m,1)).toISOString().slice(0,10);where.push('b.date>=? AND b.date<?');args.push(month+'-01',next);
  }
  const limit=calendar?500:20,rows=(await env.DB.prepare(`SELECT b.booking_code,b.customer_name AS name,b.space_id,b.date,b.status,b.phone,b.start_h,b.end_h,${bookingPhone2Sql()} AS phone2 FROM bookings b WHERE ${where.join(' AND ')} ORDER BY b.date ${period==='past'?'DESC':'ASC'},b.start_h,b.booking_code LIMIT ? OFFSET ?`).bind(...args,limit+1,calendar?0:page*20).all()).results||[];
  const items=rows.slice(0,limit),codes=items.map(x=>x.booking_code);let counts=[];
  for(let i=0;i<codes.length;i+=30){const group=codes.slice(i,i+30);counts.push(...((await env.DB.prepare(`SELECT booking_code,status,COUNT(*) AS n FROM (SELECT booking_code,status FROM transaction_notifications WHERE audience='customer' AND booking_code IN (${placeholders(group)}) UNION ALL SELECT booking_code,status FROM deposit_notifications WHERE mode='live' AND booking_code IN (${placeholders(group)}) UNION ALL SELECT booking_code,status FROM booking_guide_messages WHERE mode='live' AND booking_code IN (${placeholders(group)})) GROUP BY booking_code,status`).bind(...group,...group,...group).all()).results||[]));}
  return json({ok:true,month:calendar?month:null,items:items.map(b=>({...b,space:SPACES[b.space_id]||b.space_id,counts:Object.fromEntries(counts.filter(r=>r.booking_code===b.booking_code).map(r=>[r.status,r.n]))})),page,has_more:rows.length>limit});
 }
 const match=path.match(/^booking-notifications\/([A-Z0-9-]{1,40})(?:\/(preview|send|content))?$/);if(!match)return err('경로를 찾을 수 없습니다.',404);
 const c=await context(env,match[1]);if(!c)return err('예약을 찾을 수 없습니다.',404);
 if(match[2]==='content'&&method==='GET'){
  const kind=url.searchParams.get('kind')||'',id=url.searchParams.get('id'),engine=url.searchParams.get('engine'),records=c.history.filter(r=>r.kind===kind).sort((a,b)=>String(b.occurred_at||b.created_at).localeCompare(String(a.occurred_at||a.created_at)));
  if(!Object.hasOwn(labels,kind)&&!records.length)return err('안내 종류를 확인해 주세요.',404);
  const row=id?records.find(r=>String(r.id)===id&&r.engine===engine):records[0];if(id&&!row)return err('이 예약에 연결된 발송 이력이 아닙니다.',404);
  return json({ok:true,label:labels[kind]||kind,booking:brief(c),records:records.map(summary),record:row?summary(row):null,content:row?await historicalContent(env,row):null,current:currentContent(c,kind)});
 }
 const stages=await steps(env,c);
 if(!match[2]&&method==='GET')return json({ok:true,booking:brief(c),steps:stages,history:c.history.map(summary).sort((a,b)=>String(b.occurred_at).localeCompare(String(a.occurred_at)))});
 if(method!=='POST')return err('지원하지 않는 요청입니다.',405);
 const d=await readJson(request,8192);
 if(match[2]==='preview'){
  const stage=stages.find(x=>x.action_key===d.kind);if(!stage?.can_send)return err(stage?.reason||'이미 발송됐거나 현재 발송할 수 없는 안내입니다.',409);
  const items=[];
  for(const recipient of stage.recipients.filter(r=>r.can_send)){
   if(stage.event_row){
    const row=stage.event_row,template=CUSTOMER_ALIMTALK[row.kind];items.push({phone:recipient.phone,message:template.content.replace(/#\{번호\}/g,row.ref).replace(/#\{금액\}/g,Number(row.amount).toLocaleString('ko-KR')),buttons:[]});
   }else if(stage.engine==='transaction'){
    const ctx=await journeyContext(env,{kind:stage.kind,booking_code:c.b.booking_code,receiver:recipient.phone,event_key:stage.event_key},{preview:true});if(ctx.cancel||ctx.hold)return err(ctx.cancel||ctx.hold,409);
    const template=JOURNEY_TEMPLATES[stage.kind];items.push({phone:recipient.phone,message:ctx.render(template),buttons:ctx.buttonsFor(template)});
   }else{const template=DEPOSIT_TEMPLATES[stage.kind],e={kind:stage.kind,payload:JSON.stringify(payload(c.deposit.b)),occurred_at:now()},vars=depositNoticeVariables(c.deposit.b,e,'발송 시 생성');items.push({phone:recipient.phone,message:depositNoticeRender(template.content,vars),buttons:template.buttons.map(b=>({name:b.name,linkMo:null})),link_note:template.buttons.length?'예약자 전용 환급 계좌 링크는 실제 발송할 때 생성됩니다.':''});}
  }
  const fresh=await context(env,c.b.booking_code),id=crypto.randomUUID(),expires=Date.now()+600000;
  if(await fingerprint(c,d.kind)!==await fingerprint(fresh,d.kind))return err('예약 또는 발송 이력이 바뀌었습니다. 미리보기를 다시 열어 주세요.',409);
  await env.DB.prepare('INSERT INTO booking_guide_previews(id,payload,expires_at) VALUES(?,?,?)').bind(id,JSON.stringify({type:'booking-notifications',code:c.b.booking_code,kind:d.kind,hash:await fingerprint(fresh,d.kind),phones:items.map(x=>x.phone)}),expires).run();
  return json({ok:true,preview_id:id,expires_at:expires,booking:brief(c),label:stage.label,items});
 }
 if(match[2]==='send'){
  if(d.confirm_send!==true||typeof d.preview_id!=='string')return err('발송 미리보기를 확인해 주세요.');
  const saved=await env.DB.prepare('SELECT * FROM booking_guide_previews WHERE id=?').bind(d.preview_id).first(),p=parse(saved?.payload);
  if(!saved||saved.expires_at<=Date.now()||p.type!=='booking-notifications'||p.code!==c.b.booking_code||p.hash!==await fingerprint(c,p.kind))return err('예약·수납·수신번호 또는 발송 이력이 바뀌었습니다. 다시 미리보기해 주세요.',409);
  const stage=stages.find(x=>x.action_key===p.kind),recipients=stage?.recipients.filter(r=>r.can_send)||[];
  if(!recipients.length||JSON.stringify(recipients.map(r=>r.phone))!==JSON.stringify(p.phones))return err('발송 조건이 변경됐습니다. 다시 미리보기해 주세요.',409);
  const claimed=await env.DB.prepare('DELETE FROM booking_guide_previews WHERE id=? AND payload=? AND expires_at>?').bind(saved.id,saved.payload,Date.now()).run();if(!Number(claimed.meta?.changes??claimed.changes))return err('이미 요청한 발송입니다. 결과를 새로고침해 주세요.',409);
  const queued=[];
  for(const r of recipients){
   if(stage.engine==='transaction'){
    if(r.last_id&&r.last_engine==='transaction')await env.DB.prepare("UPDATE transaction_notifications SET status='queued',request_id=NULL,provider_mid=NULL,error='',occurred_at=?,updated_at=? WHERE id=? AND status IN ('failed','cancelled') AND receiver=? AND event_key=?").bind(now(),now(),r.last_id,c.history.find(h=>h.engine==='transaction'&&h.id===r.last_id)?.receiver||r.phone,stage.event_key).run();
    else await env.DB.prepare("INSERT OR IGNORE INTO transaction_notifications(event_key,kind,audience,ref,booking_code,receiver,occurred_at) VALUES(?,?,'customer',?,?,?,?)").bind(stage.event_key,stage.kind,c.b.booking_code,c.b.booking_code,r.phone,now()).run();
   }else{
    if(r.last_id)await env.DB.prepare("UPDATE deposit_notifications SET status='cancelled',error='관리자 최신 미리보기로 새 안내 요청',updated_at=? WHERE id=? AND status IN ('failed','cancelled')").bind(now(),r.last_id).run();
    const data={...payload(c.deposit.b),delivery_phone:r.phone};
    await env.DB.prepare("INSERT OR IGNORE INTO deposit_notifications(booking_code,kind,event_key,occurred_at,payload,mode) SELECT ?,?,?,?,?, 'live' WHERE NOT EXISTS(SELECT 1 FROM deposit_notifications WHERE booking_code=? AND mode='live' AND kind=? AND status IN ('queued','sending','accepted','unknown','review','delivered') AND COALESCE(json_extract(payload,'$.delivery_phone'),replace(json_extract(payload,'$.phone'),'-',''))=?)").bind(c.b.booking_code,stage.kind,'console:'+saved.id+':'+r.phone,now(),JSON.stringify(data),c.b.booking_code,stage.kind,r.phone).run();
   }
   queued.push(r.phone);
  }
  await log(env,'booking.notification_requested',c.b.booking_code,'admin',{kind:p.kind,preview_id:saved.id,recipients:queued.map(p=>p.slice(-4))});
  return json({ok:true,message:'발송을 요청했습니다. 자동 발송 작업이 처리하며 접수·수신 결과는 이 화면에 기록됩니다.',phones:queued});
 }
 return err('지원하지 않는 요청입니다.',405);
}
