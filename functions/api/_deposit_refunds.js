// Deposit accounts never enter static assets, query strings, or event-log detail.
import {json,err,readJson,now,str,isDate,sha256,randomToken,SPACES,kstToday,getCookie,log} from './_lib.js';
export const CONSENT_VERSION='deposit-refund-20261103-v1';
export const RETENTION_DAYS=30;
export const BANKS=[['004','KB국민은행'],['088','신한은행'],['020','우리은행'],['081','하나은행'],['011','NH농협은행'],['012','지역농축협'],['003','IBK기업은행'],['023','SC제일은행'],['027','한국씨티은행'],['090','카카오뱅크'],['089','케이뱅크'],['092','토스뱅크'],['002','KDB산업은행'],['007','Sh수협은행'],['045','새마을금고'],['048','신협'],['071','우체국'],['031','iM뱅크'],['032','부산은행'],['039','경남은행'],['034','광주은행'],['037','전북은행'],['035','제주은행'],['064','산림조합'],['050','저축은행']];
const GUIDE='https://megaspot-guide.pages.dev/';
const changed=r=>Number(r?.meta?.changes??r?.changes??0);
const parse=s=>{try{return JSON.parse(s)||{};}catch{return {};}};
const slots={'pkg-day':[10,17],'pkg-allday':[10,24],'pkg-allnight':[18,31],morning:[7,12],day:[12,17],evening:[17,24],am:[9,13],pm:[13,18],ev:[18,23],ampm:[9,18],pmev:[14,23]};
const money=v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000000;
const b64=x=>btoa(String.fromCharCode(...new Uint8Array(x)));
const un64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
const enc=new TextEncoder();
export function keyReady(env){return /^[a-f0-9]{64}$/i.test(env.DEPOSIT_ACCOUNT_KEY||'');}
async function key(env){if(!keyReady(env))throw Error('ACCOUNT_KEY_UNAVAILABLE');return crypto.subtle.importKey('raw',Uint8Array.from(env.DEPOSIT_ACCOUNT_KEY.match(/../g),x=>parseInt(x,16)), 'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(env,code,purpose,value){const iv=crypto.getRandomValues(new Uint8Array(12));const c=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('megaspot:deposit:v1:'+code+':'+purpose)},await key(env),enc.encode(JSON.stringify(value)));return 'v1.'+b64(iv)+'.'+b64(c);}
export async function unseal(env,code,purpose,value){const p=String(value||'').split('.');if(p.length!==3||p[0]!=='v1')throw Error('INVALID_CIPHERTEXT');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(p[1]),additionalData:enc.encode('megaspot:deposit:v1:'+code+':'+purpose)},await key(env),un64(p[2]))));}
export function eventTime(b){
 if(!isDate(b.date))return null;
 const h=b.start_h!=null&&b.end_h!=null?[Number(b.start_h),Number(b.end_h)]:slots[b.slot];
 if(!h||!h.every(Number.isFinite)||h[0]<0||h[1]<=h[0]||h[1]>48)return null;
 const end=Date.parse(b.date+'T00:00:00+09:00')+h[1]*3600000;
 return {end,end_date:new Date(end+9*3600000).toISOString().slice(0,10),hours:h};
}
export function refundDate(b){const e=eventTime(b);if(!e)return null;const d=new Date(e.end_date+'T00:00:00Z'),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+9);return d.toISOString().slice(0,10);}
function initialAmount(b){const doc=parse(b.confirm_doc),q=parse(b.quote_data);return money(doc.deposit)?doc.deposit:money(q.deposit)?q.deposit:150000;}
const SELECT=`SELECT b.*,r.booking_code AS refund_code,r.token_hash,r.link_cipher,r.link_expires_at,r.account_cipher,r.account_mask,r.bank_code,r.account_version,r.submitted_at,r.account_updated_at,r.state,r.amount AS deposit_amount,r.deduction,r.deduction_reason,r.deduction_notified,r.inspected,r.operator,r.note,r.revision,r.claimed_by,r.claimed_at,r.settlement_snapshot,r.completed_at,r.paid_amount,r.refund_date AS settled_refund_date,r.account_expires_at,r.purged_at,
 CASE WHEN b.inquiry_ref IS NOT NULL THEN COALESCE(json_extract(ic.checks,'$.guarantee_paid'),0) ELSE COALESCE(dc.paid,0) END AS deposit_paid,
 COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0) AS legacy_returned,
 (SELECT q.data FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref ORDER BY q.id DESC LIMIT 1) AS quote_data
 FROM bookings b LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref LEFT JOIN booking_deposit_checks dc ON dc.booking_code=b.booking_code`;
const one=(env,code)=>env.DB.prepare(SELECT+' WHERE b.booking_code=?').bind(code).first();
export async function purgeAccounts(env){return env.DB.prepare("UPDATE booking_refunds SET account_cipher=NULL,account_mask=NULL,bank_code=NULL,link_cipher=NULL,token_hash=NULL,link_expires_at=NULL,purged_at=?,revision=revision+1 WHERE account_expires_at IS NOT NULL AND account_expires_at<=? AND purged_at IS NULL").bind(now(),Date.now()).run();}
function available(b){return b&&Object.hasOwn(SPACES,b.space_id)&&['confirmed','completed'].includes(b.status);}
function publicItem(b,admin=false){
 const expired=b.account_expires_at&&b.account_expires_at<=Date.now();const exists=!!b.account_cipher&&!expired;
 const state=b.state||'pending',amount=b.deposit_amount??initialAmount(b);
 const out={code:b.booking_code,date:b.date,space:SPACES[b.space_id]||b.space_id,refund_date:b.settled_refund_date||refundDate(b),state,registered:exists,account_mask:exists?b.account_mask:'',bank:exists?(BANKS.find(x=>x[0]===b.bank_code)?.[1]||''):'',account_version:b.account_version||0,submitted_at:b.submitted_at||null,account_updated_at:b.account_updated_at||null,editable:available(b)&&state==='pending'&&!b.legacy_returned&&!b.purged_at&&!expired,completed_at:b.completed_at||null,purged:!!b.purged_at||!!expired};
 if(admin)Object.assign(out,{name:b.customer_name,phone:b.phone,booking_status:b.status,inquiry_ref:b.inquiry_ref||'',paid:!!b.deposit_paid,legacy_returned:!!b.legacy_returned,amount,deduction:b.deduction||0,deduction_reason:b.deduction_reason||'',deduction_notified:!!b.deduction_notified,refund_amount:b.paid_amount??amount-(b.deduction||0),inspected:!!b.inspected,operator:b.operator||'',note:b.note||'',revision:b.revision??0,has_record:!!b.refund_code,claimed_at:b.claimed_at||null,can_resume:!!b.settlement_snapshot,account_expires_at:b.account_expires_at||null,ended:!!eventTime(b)&&eventTime(b).end<=Date.now()});
 else out.name=String(b.customer_name||'').slice(0,1)+'○'.repeat(Math.max(1,Math.min(3,String(b.customer_name||'').length-1)));
 return out;
}
export function cleanAccount(d){
 if(!d||typeof d!=='object'||Array.isArray(d)||d.agree!==true||d.consent_version!==CONSENT_VERSION)return {error:'개인정보 수집·이용 안내를 확인하고 동의해 주세요.'};
 const bank=typeof d.bank==='string'&&BANKS.some(x=>x[0]===d.bank)?d.bank:'';
 const raw=typeof d.account==='string'?d.account:'';
 const account=raw.replace(/[ -]/g,'');
 const holder=typeof d.holder==='string'?d.holder.trim():'';
 if(!bank)return {error:'은행을 선택해 주세요.'};
 if(!/^[0-9 -]{7,40}$/.test(raw)||!/^\d{7,20}$/.test(account))return {error:'계좌번호를 숫자 7~20자리로 입력해 주세요.'};
 if(!holder||holder.length>50||/[\p{Cc}<>]/u.test(holder))return {error:'예금주명을 50자 이내로 정확하게 입력해 주세요.'};
 if(d.account_confirm!==account)return {error:'확인용 계좌번호가 일치하지 않습니다.'};
 if(!Number.isSafeInteger(d.version)||d.version<0)return {error:'화면을 새로고침한 뒤 다시 등록해 주세요.'};
 return {bank,account,holder};
}
async function actor(request){return sha256('deposit-operator:'+ (getCookie(request,'ms_admin')||request.headers.get('x-admin-key')||''));}
function snapshot(b){return JSON.stringify({date:b.date,start_h:b.start_h,end_h:b.end_h,slot:b.slot,space:b.space_id,ref:b.inquiry_ref||'',phone:b.phone,status:b.status,paid:!!b.deposit_paid,returned:!!b.legacy_returned,amount:b.deposit_amount,deduction:b.deduction,account_version:b.account_version,due:refundDate(b)});}
async function initialize(env,b){
 if(!available(b))return err('취소되었거나 지원하지 않는 예약입니다.',409,'BOOKING_UNAVAILABLE');
 if(b.legacy_returned&&!b.refund_code)return err('기존 체크리스트에서 보증금 반환이 완료된 예약입니다. 중복 환급 여부를 확인해 주세요.',409,'ALREADY_RETURNED');
 if(!b.refund_code){const t=now();await env.DB.prepare('INSERT INTO booking_refunds(booking_code,amount,created_at,updated_at) VALUES(?,?,?,?) ON CONFLICT(booking_code) DO NOTHING').bind(b.booking_code,initialAmount(b),t,t).run();}
 return null;
}
const stale=()=>err('다른 화면에서 내용이 변경되었습니다. 새로고침 후 다시 확인해 주세요.',409,'STALE');
export async function refundAdmin({env,request,url,path,method}){
 if(path==='deposit-refunds/config'&&method==='GET')return json({ok:true,key_ready:keyReady(env),retention_days:RETENTION_DAYS,consent_version:CONSENT_VERSION});
 await purgeAccounts(env);
 if(path==='deposit-refunds'&&method==='GET'){
  const filter=url.searchParams.get('filter')||'due',q=str(url.searchParams.get('q'),100),due=url.searchParams.get('due')||'',from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
  const where=[],args=[];
  if(q){where.push('(b.customer_name LIKE ? OR b.booking_code LIKE ? OR b.phone LIKE ?)');args.push(...Array(3).fill('%'+q+'%'));}
  if(from&&isDate(from)){where.push('b.date>=?');args.push(from);}if(to&&isDate(to)){where.push('b.date<=?');args.push(to);}
  // Filter in SQL so historic bookings never hide the current queue behind a page limit.
  if(filter!=='all'){
   if(filter==='completed')where.push("(r.state='completed' OR COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0)<>0)");
   else {where.push("b.status IN ('confirmed','completed') AND COALESCE(r.state,'pending')<>'completed' AND COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0)=0");
    if(filter==='missing')where.push('r.account_cipher IS NULL');
    if(filter==='processing')where.push("r.state='processing'");if(filter==='hold')where.push("r.state='hold'");
    if(filter==='due')where.push('b.date<=?'),args.push(kstToday());
   }
  }
  const {results}=await env.DB.prepare(SELECT+(where.length?' WHERE '+where.join(' AND '):'')+' ORDER BY b.date DESC,b.booking_code LIMIT 1001').bind(...args).all();
  let items=(results||[]).map(b=>publicItem(b,true));if(due)items=items.filter(b=>b.refund_date===due);if(filter==='due')items=items.filter(b=>!b.refund_date||b.refund_date<=kstToday((3-new Date(kstToday()+'T00:00Z').getUTCDay()+7)%7));
  return json({ok:true,items:items.slice(0,1000),truncated:(results||[]).length>1000,today:kstToday(),key_ready:keyReady(env)});
 }
 const m=path.match(/^deposit-refunds\/bookings\/([A-Z0-9-]+)(?:\/(link|rotate-link|settlement|reveal|claim|complete|hold|release|resume|history))?$/);
 if(!m)return err('경로를 찾을 수 없습니다.',404);
 const code=m[1],action=m[2]||'',b=await one(env,code);if(!b)return err('예약을 찾을 수 없습니다.',404);
 if(method==='GET'&&!action)return json({ok:true,item:publicItem(b,true)});
 if(method==='GET'&&action==='history'){const {results}=await env.DB.prepare("SELECT kind,actor,detail,created_at FROM event_log WHERE ref=? AND kind LIKE 'deposit.%' ORDER BY id DESC LIMIT 60").bind(code).all();return json({ok:true,items:results||[]});}
 if(method!=='POST')return err('허용되지 않은 요청입니다.',405);
 const d=await readJson(request,8192);if(!d||typeof d!=='object'||Array.isArray(d))return err('입력 내용을 확인해 주세요.');
 if(['link','rotate-link'].includes(action)){
  if(!keyReady(env))return err('환급 계좌 암호화 설정이 필요합니다.',503,'ACCOUNT_KEY_UNAVAILABLE');
  const denied=await initialize(env,b);if(denied)return denied;
  const row=await one(env,code);
  if(row.state==='completed'||row.purged_at||row.legacy_returned)return err('환급이 완료된 예약입니다.',409);
  if(!eventTime(row))return err('예약의 이용 시작·종료 시간을 먼저 확인해 주세요.',409);
  if(row.state==='processing')return err('송금 처리 중에는 링크를 변경할 수 없습니다.',409);
  let token;
  if(action==='link'&&row.link_cipher&&row.link_expires_at>Date.now())token=await unseal(env,code,'link',row.link_cipher);
  else{
   if(action==='rotate-link'&&(d.confirm_revoke!==true||d.revision!==row.revision))return stale();
   token=randomToken();const encrypted=await seal(env,code,'link',token),expiry=Math.max(Date.now()+90*864e5,eventTime(row).end+90*864e5);
   const r=await env.DB.prepare('UPDATE booking_refunds SET token_hash=?,link_cipher=?,link_expires_at=?,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND state<>\'processing\' AND state<>\'completed\'').bind(await sha256(token),encrypted,expiry,now(),code,row.revision).run();if(!changed(r))return stale();
   await log(env,'deposit.link_issued',code,'admin',{rotated:action==='rotate-link'});
  }
  return json({ok:true,url:(row.space_id==='megaspot-gundae'?GUIDE:url.origin+'/deposit/')+'#refund-account='+token,item:publicItem(await one(env,code),true)});
 }
 if(!b.refund_code)return err('먼저 고객용 계좌 등록 링크를 발급해 주세요.',409);
 if(!Number.isSafeInteger(d.revision)||d.revision!==b.revision)return stale();
 if(action==='settlement'){
  if(b.state!=='pending'||b.legacy_returned)return err('대기 중인 예약만 수정할 수 있습니다.',409);
  if(!money(d.amount)||!money(d.deduction)||d.deduction>d.amount)return err('보증금액·차감액을 확인해 주세요.');
  if(d.deduction>0&&(!str(d.deduction_reason,500)||d.deduction_notified!==true))return err('차감 사유를 입력하고 고객에게 사전 안내했는지 확인해 주세요.');
  const op=str(d.operator,40);if(!op)return err('처리 담당자 이름을 입력해 주세요.');
  if(d.inspected===true&&(!eventTime(b)||eventTime(b).end>Date.now()))return err('이용이 종료된 후 시설 확인을 기록해 주세요.',409);
  const r=await env.DB.prepare("UPDATE booking_refunds SET amount=?,deduction=?,deduction_reason=?,deduction_notified=?,inspected=?,operator=?,note=?,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND state='pending'").bind(d.amount,d.deduction,d.deduction?str(d.deduction_reason,500):'',d.deduction&&d.deduction_notified===true?1:0,d.inspected===true?1:0,op,str(d.note,1000),now(),code,b.revision).run();if(!changed(r))return stale();
  await log(env,'deposit.settlement_saved',code,op,{amount:d.amount,deduction:d.deduction,inspected:d.inspected===true});
 }else if(action==='reveal'){
  if(!b.account_cipher||b.purged_at||(b.account_expires_at&&b.account_expires_at<=Date.now()))return err('조회할 수 있는 계좌가 없습니다.',409);
  const account=await unseal(env,code,'account',b.account_cipher);await log(env,'deposit.account_viewed',code,b.operator||'admin',{version:b.account_version});
  return json({ok:true,account:{...account,bank_name:BANKS.find(x=>x[0]===account.bank)?.[1]||''}});
 }else if(action==='claim'){
  if(!available(b)||b.legacy_returned||b.state!=='pending')return err('송금 처리를 시작할 수 없는 예약입니다.',409);
  if(!b.deposit_paid||!b.inspected||!eventTime(b)||eventTime(b).end>Date.now()||!b.operator)return err('보증금 입금·이용 종료·시설 확인·담당자를 먼저 확인해 주세요.',409);
  if(b.deduction&&(!b.deduction_reason||!b.deduction_notified))return err('차감 사유와 고객 안내 여부를 확인해 주세요.',409);
  if(b.deposit_amount-b.deduction>0&&!b.account_cipher)return err('고객 환급 계좌가 아직 등록되지 않았습니다.',409);
  if(d.confirm_start!==true)return err('실제 은행 송금 전 확인 항목을 체크해 주세요.');
  const r=await env.DB.prepare("UPDATE booking_refunds SET state='processing',claimed_by=?,claimed_at=?,settlement_snapshot=?,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND state='pending'").bind(await actor(request),now(),snapshot(b),now(),code,b.revision).run();if(!changed(r))return stale();
  await log(env,'deposit.claimed',code,b.operator,{amount:b.deposit_amount-b.deduction,version:b.account_version});
 }else if(action==='complete'){
  if(b.state!=='processing'||b.claimed_by!==await actor(request))return err('송금 처리를 시작한 관리자 로그인에서 완료해 주세요.',409);
  if(!available(b)||b.settlement_snapshot!==snapshot(b))return err('예약 또는 입금 상태가 변경되었습니다. 송금 여부를 확인한 뒤 보류 처리해 주세요.',409);
  if(d.confirm_transfer!==true||d.confirm_payee!==true||d.paid_amount!==b.deposit_amount-b.deduction)return err('실제 송금액과 예금주 대조·송금 완료 여부를 확인해 주세요.');
  const id=randomToken(),t=now(),expiry=Date.now()+RETENTION_DAYS*864e5;
  const update=env.DB.prepare("UPDATE booking_refunds SET state='completed',completed_at=?,paid_amount=?,refund_date=?,completion_id=?,account_expires_at=?,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND state='processing' AND claimed_by=?").bind(t,d.paid_amount,refundDate(b),id,expiry,t,code,b.revision,await actor(request));
  const statements=[update];
  if(b.inquiry_ref)statements.push(env.DB.prepare("INSERT INTO inquiry_checks(ref,checks,updated_at) SELECT ?,json_object('guarantee_returned',?),? WHERE EXISTS(SELECT 1 FROM booking_refunds WHERE booking_code=? AND completion_id=?) AND NOT EXISTS(SELECT 1 FROM bookings b2 LEFT JOIN booking_refunds r2 ON r2.booking_code=b2.booking_code WHERE b2.inquiry_ref=? AND b2.status<>'cancelled' AND COALESCE(r2.state,'pending')<>'completed') ON CONFLICT(ref) DO UPDATE SET checks=json_set(inquiry_checks.checks,'$.guarantee_returned',?),updated_at=excluded.updated_at").bind(b.inquiry_ref,t,t,code,id,b.inquiry_ref,t));
  const result=await env.DB.batch(statements);if(!changed(result[0]))return stale();
  await log(env,'deposit.completed',code,b.operator,{amount:d.paid_amount,deduction:b.deduction,reference:str(d.reference,100)});
 }else if(action==='resume'){
  if(!['processing','hold'].includes(b.state)||!b.settlement_snapshot||d.confirm_reconciled!==true||!str(d.reason,500)||!str(d.operator,40))return err('은행의 기존 송금 결과를 확인하고 담당자와 이어받기 사유를 입력해 주세요.');
  if(!available(b)||b.settlement_snapshot!==snapshot(b))return err('예약·입금 정보가 송금 시작 당시와 다릅니다. 먼저 확인해 주세요.',409);
  const r=await env.DB.prepare("UPDATE booking_refunds SET state='processing',claimed_by=?,operator=?,note=?,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND state IN ('processing','hold')").bind(await actor(request),str(d.operator,40),str(d.reason,500),now(),code,b.revision).run();if(!changed(r))return stale();
  await log(env,'deposit.resumed',code,str(d.operator,40),{reason:str(d.reason,500)});
 }else if(action==='hold'||action==='release'){
  const reason=str(d.reason,500);if(!reason)return err('처리 사유를 입력해 주세요.');
  if(b.state==='completed')return err('완료된 환급은 변경할 수 없습니다.',409);
  if(action==='release'&&d.confirm_not_transferred!==true)return err('은행에서 송금되지 않았음을 확인한 경우에만 대기로 복구할 수 있습니다.');
  const r=await env.DB.prepare("UPDATE booking_refunds SET state=?,note=?,inspected=CASE WHEN ?='pending' THEN 0 ELSE inspected END,claimed_by=CASE WHEN ?='pending' THEN NULL ELSE claimed_by END,claimed_at=CASE WHEN ?='pending' THEN NULL ELSE claimed_at END,settlement_snapshot=CASE WHEN ?='pending' THEN NULL ELSE settlement_snapshot END,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND state<>'completed'").bind(action==='hold'?'hold':'pending',reason,action==='release'?'pending':'hold',...Array(3).fill(action==='release'?'pending':'hold'),now(),code,b.revision).run();if(!changed(r))return stale();
  await log(env,'deposit.'+action,code,b.operator||'admin',{reason});
 }else return err('경로를 찾을 수 없습니다.',404);
 return json({ok:true,item:publicItem(await one(env,code),true)});
}
export async function refundCustomer({env,request}){
 if(!keyReady(env))return err('환급 계좌 등록을 준비 중입니다. 관리자에게 문의해 주세요.',503);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return err('예약자 전용 링크로 접속해 주세요.',403);
 const row=await env.DB.prepare('SELECT booking_code FROM booking_refunds WHERE token_hash=? AND link_expires_at>? AND purged_at IS NULL').bind(await sha256(token),Date.now()).first();
 const b=row&&await one(env,row.booking_code);
 if(!b||!available(b)||(b.account_expires_at&&b.account_expires_at<=Date.now()))return err('사용할 수 없는 링크입니다. 관리자에게 새 링크를 요청해 주세요.',403);
 if(request.method==='GET')return json({ok:true,item:publicItem(b),banks:BANKS,consent_version:CONSENT_VERSION,retention_days:RETENTION_DAYS});
 if(request.method!=='POST')return err('허용되지 않은 요청입니다.',405);
 if(b.state!=='pending'||b.legacy_returned)return err('환급 처리 중이거나 완료된 예약은 계좌를 수정할 수 없습니다.',409);
 const d=await readJson(request,4096),input=cleanAccount(d);if(input.error)return err(input.error);
 if(d.version!==b.account_version)return stale();
 const encrypted=await seal(env,b.booking_code,'account',input),t=now();
 // A revision CAS also arbitrates submission versus a concurrent operator claim/link rotation.
 const r=await env.DB.prepare("UPDATE booking_refunds SET account_cipher=?,account_mask=?,bank_code=?,account_version=account_version+1,submitted_at=COALESCE(submitted_at,?),account_updated_at=?,consent_version=?,consent_at=?,account_expires_at=?,revision=revision+1,updated_at=? WHERE booking_code=? AND revision=? AND account_version=? AND token_hash=? AND state='pending'").bind(encrypted,'•••• '+input.account.slice(-4),input.bank,t,t,CONSENT_VERSION,t,Math.max(Date.now(),eventTime(b)?.end||Date.now())+90*864e5,t,b.booking_code,b.revision,b.account_version,await sha256(token)).run();
 if(!changed(r))return stale();
 await log(env,'deposit.account_registered',b.booking_code,'customer',{version:b.account_version+1,consent:CONSENT_VERSION});
 return json({ok:true,item:publicItem(await one(env,b.booking_code))});
}
