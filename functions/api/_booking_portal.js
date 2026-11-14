import {depositDueDate} from './_deposit_due.js';
import {trialPortalResponse} from './_booking_journey_trial.js';
// Separate capability for a reservation's unified page. Never accept a confirm/last4 token here.
import {settlementFor} from './_settlement.js';
import {paymentSchedule} from './_booking_payment_schedule.js';
import {json,err,now,str,sha256,randomToken,readJson,log} from './_lib.js';
import {parseDoc,publicDoc,maskPhone,SPACES} from './_confirm.js';
import {keyReady,seal,unseal,eventTime,refundDate,refundBooking,refundAdmin,refundCustomer} from './_deposit_refunds.js';

const DAY=86400000,valid=b=>b&&Object.hasOwn(SPACES,b.space_id)&&['confirmed','completed'].includes(b.status);
const parse=s=>{try{return JSON.parse(s||'{}')||{};}catch{return {};}};
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000;
const changes=r=>Number(r?.meta?.changes??r?.changes??0);
const contact=b=>JSON.stringify([String(b.customer_name||'').trim(),String(b.phone||'').replace(/\D/g,'')]);
const recipient=b=>sha256(contact(b));
function depositAmount(b){const d=parseDoc(b.confirm_doc),q=parse(b.quote_data);return money(b.deposit_amount)?b.deposit_amount:money(d?.deposit)?d.deposit:money(q.deposit)?q.deposit:150000;}
const expires=b=>Math.max(Date.now()+30*DAY,(eventTime(b)?.end||Date.now())+90*DAY);
const urlFor=(origin,token)=>origin+'/booking/#booking='+token;

// Read-only operational status. Never issue a link or return its capability token.
export async function portalPreparationState(env,b,link,at=Date.now()){
 const state=(status,label,reason='')=>({status,label,reason,complete:status==='ready',can_open:valid(b)});
 if(!valid(b))return {...state('blocked','준비 보류',b?.status==='payment_review'?'일정 검토 후 예약을 확정해 주세요.':'취소된 예약은 안내할 수 없습니다.'),can_open:false};
 if(!keyReady(env))return {...state('unavailable','설정 확인 필요','통합 링크 암호화 설정을 확인해 주세요.'),can_open:false};
 if(!link)return state('missing','미준비','전용 링크를 아직 준비하지 않았습니다.');
 if(link.expires_at<=at)return state('expired','만료','기존 통합 링크가 만료됐습니다.');
 if(link.recipient_hash!==await recipient(b))return state('changed','예약자 변경','예약자 또는 연락처가 변경돼 기존 링크를 사용할 수 없습니다.');
 try{
  const token=await unseal(env,b.booking_code,'portal-link',link.link_cipher);
  if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token)||await sha256(token)!==link.token_hash)throw Error('INVALID_LINK');
 }catch{return state('unavailable','링크 확인 필요','저장된 전용 링크를 확인할 수 없습니다.');}
 return {...state('ready','준비 완료'),expires_at:link.expires_at,version:link.version};
}

// Server-only copy of the existing, operator-provided 1호 arrival instructions.
// Never put these values in a public page bundle, an unauthenticated response, or the 2호 guide.
function arrival(b){
 const shared={space:SPACES[b.space_id],address:'서울시 광진구 능동로13길 39, 한아름건물 2층',checkin:'예약 시작 시간부터',checkout:'예약 종료 시간까지',note:'준비와 정리 시간도 예약하신 이용 시간에 포함됩니다.'};
 if(b.space_id==='megaspot-gundae-2')return {...shared,ready:true,door_code:'0105#',wifi_name:'설치 예정',wifi_password:'',lock_note:'자동문이 닫히고 잠금 상태인지 확인해 주세요.',equipment_url:'https://megaspot.kr/arrival/space2/'};
 if(b.space_id!=='megaspot-gundae')return {...shared,ready:false,message:'운영팀에 입실 안내를 문의해 주세요.'};
 return {...shared,ready:true,door_code:'0105*',wifi_name:'U+NetBB18_5G/2.4G',wifi_password:'#2CF96J5B5',lock_note:'퇴실 시 도어락의 # 버튼을 누르고 잠금 상태를 확인해 주세요.',equipment_url:'https://megaspot.kr/arrival/space1/#facilities'};
}
function accountState(b,amount){
 const expired=!!(b.account_expires_at&&b.account_expires_at<=Date.now()),registered=!!b.account_cipher&&!expired;
 const returned=!!b.legacy_returned||b.state==='completed',purged=!!b.purged_at||expired;
 return {registered,state:returned?'completed':b.state||'pending',available:amount>0&&!returned&&!purged&&!!eventTime(b)&&!!b.link_cipher&&b.link_expires_at>Date.now(),purged,completed_at:b.completed_at||null};
}
export async function portalAdmin({env,request,url,path,method}){
 const match=path.match(/^bookings\/([A-Z0-9-]{1,40})\/portal-link(?:\/(rotate))?$/);if(!match)return null;
 const code=match[1],b=await refundBooking(env,code);if(!b)return err('예약을 찾을 수 없습니다.',404);
 if(!valid(b))return err('확정 또는 이용 완료 예약만 통합 안내를 만들 수 있습니다.',409);
 if(!keyReady(env))return err('예약자 전용 링크 암호화 설정이 필요합니다.',503);
 const old=await env.DB.prepare('SELECT * FROM booking_portal_links WHERE booking_code=?').bind(code).first(),hash=await recipient(b);
 if(method==='GET')return json({ok:true,issued:!!old,active:!!old&&old.expires_at>Date.now()&&old.recipient_hash===hash,version:old?.version||0,expires_at:old?.expires_at||null});
 if(method!=='POST')return err('허용되지 않은 요청입니다.',405);
 const d=await readJson(request,2048),rotate=match[2]==='rotate';
 if(rotate&&(!old||d.confirm_revoke!==true||d.version!==old.version))return err('기존 링크 폐기 여부와 최신 버전을 확인해 주세요.',409,'STALE');
 // Reuse the existing invitation issuer; never rotate a customer's earlier refund link here.
 const amount=depositAmount(b),account=accountState(b,amount);
 if(amount>0&&!b.legacy_returned&&!b.purged_at&&!['completed','processing','hold'].includes(b.state)&&eventTime(b)&&!account.available){
  const response=await refundAdmin({env,request:new Request(url.origin+'/api/admin/deposit-refunds/bookings/'+code+'/link',{method:'POST',headers:request.headers,body:'{}'}),url:new URL(url.origin+'/api/admin/deposit-refunds/bookings/'+code+'/link'),path:'deposit-refunds/bookings/'+code+'/link',method:'POST'});
  if(!response.ok)return response;
 }
 const origin=env.SITE_URL||(/\.pages\.dev$/.test(url.hostname)?'https://megaspot.kr':url.origin);
 if(!rotate&&old&&old.expires_at>Date.now()&&old.recipient_hash===hash){
  const token=await unseal(env,code,'portal-link',old.link_cipher);return json({ok:true,url:urlFor(origin,token),version:old.version,expires_at:old.expires_at});
 }
 const token=randomToken(),cipher=await seal(env,code,'portal-link',token),expiry=expires(b),at=now(),version=(old?.version||0)+1;
 const result=await env.DB.prepare('INSERT INTO booking_portal_links(booking_code,token_hash,link_cipher,recipient_hash,version,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(booking_code) DO UPDATE SET token_hash=excluded.token_hash,link_cipher=excluded.link_cipher,recipient_hash=excluded.recipient_hash,version=excluded.version,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE booking_portal_links.version=?').bind(code,await sha256(token),cipher,hash,version,expiry,at,at,old?.version||0).run();
 if(!changes(result))return err('다른 화면에서 링크가 변경되었습니다. 다시 확인해 주세요.',409,'STALE');
 await log(env,'booking.portal_link',code,'admin',{rotated:rotate,version});
 return json({ok:true,url:urlFor(origin,token),version,expires_at:expiry});
}
// Internal message integration. Reuse issued links and refuse stale/revoked references.
// Called only after an authenticated preview or an eligible, explicitly enabled send.
export async function portalMessageLink(env,code,{issue=false,expected=null}={}){
 if(!keyReady(env))throw Error('예약자 전용 링크 암호화 설정이 필요합니다.');
 const origin=env.SITE_URL||'https://megaspot.kr';
 if(issue){
  const url=new URL(origin+'/api/admin/bookings/'+code+'/portal-link');
  const result=await portalAdmin({env,url,path:'bookings/'+code+'/portal-link',method:'POST',request:new Request(url,{method:'POST',body:'{}'})});
  if(!result.ok)throw Error((await result.json()).error||'통합 안내 링크를 만들지 못했습니다.');
 }
 const b=await refundBooking(env,code),link=await env.DB.prepare('SELECT * FROM booking_portal_links WHERE booking_code=?').bind(code).first();
 if(!valid(b)||!link||link.expires_at<=Date.now()||link.recipient_hash!==await recipient(b))return null;
 const reference={version:link.version,token_hash:link.token_hash,recipient_hash:link.recipient_hash};
 if(expected&&Object.keys(reference).some(k=>reference[k]!==expected[k]))return null;
 return {url:urlFor(origin,await unseal(env,code,'portal-link',link.link_cipher)),reference};
}
async function authorize(env,request){
 if(!keyReady(env))return {error:err('예약 안내를 준비 중입니다. 운영팀에 문의해 주세요.',503)};
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return {error:err('예약자 전용 통합 안내 링크로 접속해 주세요.',403,'BAD_LINK')};
 const hash=await sha256(token),link=await env.DB.prepare('SELECT booking_code,recipient_hash,version FROM booking_portal_links WHERE token_hash=? AND expires_at>?').bind(hash,Date.now()).first();
 const b=link&&await refundBooking(env,link.booking_code);
 if(!valid(b)||await recipient(b)!==link.recipient_hash)return {error:err('사용할 수 없는 링크입니다. 운영팀에 새 링크를 요청해 주세요.',403,'BAD_LINK')};
 return {b,hash,link};
}
export async function portalCustomer({env,request,path}){
 const trial=await trialPortalResponse(env,request,path);if(trial)return trial;
 const auth=await authorize(env,request);if(auth.error)return auth.error;
 const {b,hash,link}=auth,amount=depositAmount(b),account=accountState(b,amount);
 if(path==='view'&&request.method==='GET'){
  const visibility=await env.DB.prepare('SELECT amount_visible,confirmed_at,confirm_version FROM booking_journey_state WHERE booking_code=?').bind(b.booking_code).first();
  const doc=parseDoc(b.confirm_doc),issued=!!doc?.issued_at,showAmount=doc?.show_amount!==false&&visibility?.amount_visible!==0,end=eventTime(b);
  const deposit={amount:showAmount?amount:null,amount_visible:showAmount,paid:!!b.deposit_paid,returned:account.state==='completed',due_date:null,refund_date:b.settled_refund_date||refundDate(b),account};
  if(end)deposit.due_date=depositDueDate({...b,confirmed_day:visibility?.confirm_version>0?visibility.confirmed_at?.slice(0,10):undefined});
  if(showAmount&&amount>0&&!deposit.paid&&!deposit.returned)deposit.bank={name:'하나은행',account:'298-910064-39104',holder:'주식회사 블랭크'};
  const settlement=showAmount?await settlementFor(env,b.booking_code):null,schedule=await paymentSchedule(env,b);
  const payment={amount_visible:showAmount,total:settlement?.amount??null,received:settlement?.received??null,refunded:settlement?.refunded??null,paid:settlement?.net??null,balance:settlement?.balance??null,refund_due:settlement?.refund_due??null,due_date:schedule.due_date,complete:!!settlement&&settlement.amount!=null&&settlement.balance===0&&!settlement.over_refunded};
  if(showAmount&&payment.balance>0)payment.bank={name:'하나은행',account:'298-910064-39104',holder:'주식회사 블랭크'};
  return json({ok:true,payment,booking:{code:b.booking_code,name:b.customer_name,phone:maskPhone(b.phone),space:SPACES[b.space_id],date:b.date,start_h:end?.hours[0]??null,end_h:end?.hours[1]??null,headcount:b.headcount,status:b.status,ended:!!end&&end.end<=Date.now(),updated_at:b.updated_at||b.created_at},confirmation:issued?publicDoc(b,doc):null,deposit,arrival:arrival(b)});
 }
 if(path==='account'&&['GET','POST'].includes(request.method)){
  if(!account.available)return err(account.purged?'계좌 보유기간이 종료되었습니다. 운영팀에 문의해 주세요.':'현재 환급 계좌를 등록할 수 없습니다. 운영팀에 문의해 주세요.',409,'ACCOUNT_UNAVAILABLE');
  const token=await unseal(env,b.booking_code,'link',b.link_cipher);
  const delegated=new Request(request.url,{method:request.method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(request.method==='POST'?{body:JSON.stringify(await readJson(request,4096))}:{})});
  return refundCustomer({env,request:delegated,portalGuard:{hash,version:link.version,recipient_hash:link.recipient_hash,phone:b.phone,name:b.customer_name}});
 }
 return err('허용되지 않은 요청입니다.',405);
}
