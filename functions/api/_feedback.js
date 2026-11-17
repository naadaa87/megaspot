import {json,err,readJson,str,now,sha256,randomToken,log,SPACES,sameOrigin,clientIp,tooMany,hit} from './_lib.js';
import {keyReady,seal,unseal} from './_deposit_refunds.js';
export const CATEGORIES=['없음','청결','장비','냉난방','입실·안내','주차','기타'];
export const CONSENT='feedback-20261117';
const headers={'Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
const ok=data=>json({ok:true,...data},200,headers);
const changed=r=>Number(r?.meta?.changes??r?.changes??0)>0;
const fingerprint=b=>sha256(JSON.stringify([b.customer_name,b.phone,b.space_id,b.date]));
const booking=(env,code)=>env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(code).first();
export function feedbackMessage(b){return `[메가스팟 이용 후 의견 안내]\n\n${String(b.customer_name).replace(/[\r\n]/g,' ')}님, 메가스팟 건대 ${b.space_id==='megaspot-gundae-2'?'2호':'1호'}에서 즐거운 시간 보내셨나요?\n함께해 주셔서 감사합니다.\n\n이용 공간: ${SPACES[b.space_id]}\n이용 날짜: ${b.date}\n\n이용 중 불편했던 점이나 개선이 필요한 부분이 있었다면 아래 버튼으로 남겨 주세요.\n좋았던 점도 함께 들려주시면 공간 운영에 참고하겠습니다.\n\n남겨 주신 의견은 운영팀이 확인하겠습니다.`;}
export async function feedbackAdmin({env,request,url,path,method}){
 if(path==='feedback'&&method==='GET'){
  const page=Math.max(1,Math.min(10000,parseInt(url.searchParams.get('page'),10)||1)),q=str(url.searchParams.get('q'),80),state=url.searchParams.get('state')||'',month=url.searchParams.get('month')||'';
  if(state&&!['unanswered','received','reviewing','resolved'].includes(state))return err('처리 상태를 확인해 주세요.');
  if(month&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return err('조회 월을 확인해 주세요.');
  const where=["b.status='completed'"],args=[];
  if(q){where.push('(instr(b.customer_name,?)>0 OR instr(b.booking_code,?)>0)');args.push(q,q);}
  if(state){where.push("COALESCE(f.state,'unanswered')=?");args.push(state);}
  if(month){where.push('substr(b.date,1,7)=?');args.push(month);}
  const from=' FROM bookings b LEFT JOIN booking_feedback f ON f.booking_code=b.booking_code WHERE '+where.join(' AND ');
  const total=(await env.DB.prepare('SELECT COUNT(*) AS n'+from).bind(...args).first()).n;
  const {results}=await env.DB.prepare("SELECT b.booking_code,b.customer_name,b.space_id,b.date,COALESCE(f.state,'unanswered') AS state,f.rating,f.submitted_at"+from+' ORDER BY b.date DESC,b.booking_code LIMIT 50 OFFSET ?').bind(...args,(page-1)*50).all();
  return ok({items:results,total,page});
 }
 const m=path.match(/^feedback\/([A-Z0-9-]{1,40})(?:\/(prepare))?$/);if(!m)return err('경로를 찾을 수 없습니다.',404);
 const code=m[1],b=await booking(env,code);if(!b)return err('예약을 찾을 수 없습니다.',404);
 const f=await env.DB.prepare('SELECT * FROM booking_feedback WHERE booking_code=?').bind(code).first();
 if(method==='GET'&&!m[2])return ok({booking:{code,name:b.customer_name,date:b.date,space:SPACES[b.space_id],status:b.status},response:f?.submitted_at?{rating:f.rating,categories:JSON.parse(f.categories),body:f.body,contact_requested:!!f.contact_requested,submitted_at:f.submitted_at}:null,state:f?.state||'unanswered',note:f?.note||'',revision:f?.revision||0});
 if(method==='POST'&&m[2]==='prepare'){
  if(b.status!=='completed'||!SPACES[b.space_id])return err('직영 공간의 이용 완료 예약만 설문을 준비할 수 있습니다.',409);
  if(f?.submitted_at)return err('이미 응답이 접수된 예약입니다.',409);
  if(!keyReady(env))return err('전용 링크 암호화 설정을 확인해 주세요.',503);
  const hash=await fingerprint(b);let token;
  if(f&&f.expires_at>Date.now()&&f.recipient_hash===hash)token=await unseal(env,code,'feedback-link',f.link_cipher);
  else{
   token=randomToken();const at=now();
   const result=await env.DB.prepare("INSERT INTO booking_feedback(booking_code,token_hash,link_cipher,recipient_hash,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(booking_code) DO UPDATE SET token_hash=excluded.token_hash,link_cipher=excluded.link_cipher,recipient_hash=excluded.recipient_hash,expires_at=excluded.expires_at,revision=booking_feedback.revision+1,updated_at=excluded.updated_at WHERE booking_feedback.submitted_at IS NULL AND booking_feedback.revision=?").bind(code,await sha256(token),await seal(env,code,'feedback-link',token),hash,Date.now()+90*864e5,at,at,f?.revision??0).run();
   if(!changed(result))return err('다른 화면에서 변경되었습니다. 새로고침해 주세요.',409);
   await log(env,'feedback.link_prepared',code,'admin',{});
  }
  const origin=env.SITE_URL||(/\.pages\.dev$/.test(url.hostname)?'https://megaspot.kr':url.origin);
  return ok({url:origin+'/feedback/#feedback='+token,message:feedbackMessage(b),button:'이용 의견 남기기',delivery:'draft_only'});
 }
 if(method==='PATCH'&&!m[2]){
  const d=await readJson(request,16384);
  if(!['received','reviewing','resolved'].includes(d.state)||typeof d.note!=='string'||d.note.length>3000||!Number.isInteger(d.revision))return err('처리 상태와 메모를 확인해 주세요.');
  const result=await env.DB.prepare('UPDATE booking_feedback SET state=?,note=?,revision=revision+1,updated_at=? WHERE booking_code=? AND submitted_at IS NOT NULL AND revision=?').bind(d.state,d.note.trim(),now(),code,d.revision).run();
  if(!changed(result))return err('응답이 없거나 다른 화면에서 변경되었습니다. 새로고침해 주세요.',409);
  await log(env,'feedback.status_updated',code,'admin',{state:d.state});return ok({});
 }
 return err('지원하지 않는 요청입니다.',405);
}
export async function feedbackCustomer({env,request}){
 if(!env.DB)return err('잠시 후 다시 시도해 주세요.',503);
 if(!['GET','POST'].includes(request.method))return err('지원하지 않는 요청입니다.',405);
 if(!sameOrigin(request))return err('허용되지 않은 요청입니다.',403);
 const token=(request.headers.get('authorization')||'').replace(/^Bearer /,'');
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return err('예약별 설문 링크로 접속해 주세요.',403);
 const rate='feedback:'+clientIp(request);
 if(await tooMany(env,rate,60,10))return err('잠시 후 다시 시도해 주세요.',429);
 await hit(env,rate,10);
 const f=await env.DB.prepare('SELECT * FROM booking_feedback WHERE token_hash=?').bind(await sha256(token)).first();
 const b=f&&await booking(env,f.booking_code);
 if(!b||b.status!=='completed'||f.expires_at<=Date.now()||f.recipient_hash!==await fingerprint(b))return err('만료되었거나 사용할 수 없는 설문 링크입니다. 운영팀에 문의해 주세요.',403);
 if(request.method==='GET')return ok({booking:{space:SPACES[b.space_id],date:b.date},submitted:!!f.submitted_at,categories:CATEGORIES,consent_version:CONSENT});
 const d=await readJson(request,16384);
 if(!Number.isInteger(d.rating)||d.rating<1||d.rating>5||!Array.isArray(d.categories)||d.categories.length<1||d.categories.length>7||new Set(d.categories).size!==d.categories.length||d.categories.some(x=>!CATEGORIES.includes(x))||(d.categories.includes('없음')&&d.categories.length>1)||typeof d.body!=='string'||d.body.length>1500||typeof d.contact_requested!=='boolean'||d.agree!==true||d.consent_version!==CONSENT)return err('필수 항목과 동의를 확인해 주세요.');
 const result=await env.DB.prepare("UPDATE booking_feedback SET rating=?,categories=?,body=?,contact_requested=?,consent_version=?,submitted_at=?,state='received',revision=revision+1,updated_at=? WHERE booking_code=? AND token_hash=? AND submitted_at IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM bookings b WHERE b.booking_code=booking_feedback.booking_code AND b.status='completed' AND b.phone IS ? AND b.customer_name IS ? AND b.date IS ? AND b.space_id IS ?)").bind(d.rating,JSON.stringify(d.categories),d.body.trim(),d.contact_requested?1:0,CONSENT,now(),now(),b.booking_code,await sha256(token),Date.now(),b.phone,b.customer_name,b.date,b.space_id).run();
 if(!changed(result))return err('이미 접수되었거나 예약 정보가 변경되었습니다. 화면을 새로고침해 주세요.',409);
 await log(env,'feedback.received',b.booking_code,'customer',{});return ok({submitted:true});
}
