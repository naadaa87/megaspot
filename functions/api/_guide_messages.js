// Reservation guide Alimtalk. No credentials or public sending routes live in the browser.
import { json, err, now, readJson, str, sha256, SPACES } from './_lib.js';

export const GUIDE_URL = 'https://megaspot-guide.pages.dev/';
export const GUIDE_VERSION = 'reservation-guide-v1';
export const GUIDE_BUTTON = { name: '시설 이용 안내 확인', linkType: 'WL', linkTypeName: '웹링크', linkMo: GUIDE_URL, linkPc: GUIDE_URL };
export const GUIDE_TEMPLATE = `[메가스팟 예약 고객 이용 안내]

#{고객명}님, 예약하신 메가스팟의
시설 이용 안내를 보내드립니다.

■ 예약 공간: #{공간명}
■ 이용 날짜: #{이용일}
■ 이용 시간: #{이용시간}

방문 전 아래 이용 안내에서
오시는 길·주차, 출입 방법, 장비 사용법과
퇴실 체크리스트를 확인해 주세요.

준비와 정리 시간도 예약하신 이용 시간에 포함됩니다.

문의가 있으시면 안내 페이지의
카카오톡 문의를 이용해 주세요.`;
const NORMAL_SLOTS = { 'pkg-day': [10,17], 'pkg-allday': [10,24], 'pkg-allnight': [18,31], morning:[7,12], day:[12,17], evening:[17,24], am:[9,13], pm:[13,18], ev:[18,23], ampm:[9,18], pmev:[14,23] };
const KEY = 'reservation_guide';
const ACTIVE = "('queued','sending','accepted','unknown','delivered')";
const secrets = ['ALIGO_USERID','ALIGO_API_KEY','ALIGO_SENDER_KEY','ALIGO_SENDER'];
const parse = (raw, fallback = {}) => { try { return JSON.parse(raw) || fallback; } catch { return fallback; } };
const changed = r => Number(r?.meta?.changes ?? r?.changes ?? 0);
const normalize = s => String(s || '').replace(/\r\n/g, '\n');
export function guidePhone(p) { let s = String(p || '').replace(/\D/g, ''); if (s.startsWith('82')) s = '0' + s.slice(2); return /^01[016789]\d{7,8}$/.test(s) ? s : ''; }
function hours(b) { return b.start_h != null && b.end_h != null ? [Number(b.start_h), Number(b.end_h)] : NORMAL_SLOTS[b.slot] || []; }
function hour(h) { return (h >= 24 ? '다음날 ' : '') + String(Math.floor(h % 24)).padStart(2,'0') + ':' + String(Math.round((h % 1) * 60)).padStart(2,'0'); }
export function guideMessage(b) {
  const [s,e] = hours(b), vars = { 고객명: String(b.customer_name || '').replace(/[\r\n\t]/g, ' ').trim(), 공간명: SPACES[b.space_id] || '', 이용일: String(b.date || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일'), 이용시간: s == null ? '' : hour(s) + '~' + hour(e) };
  return GUIDE_TEMPLATE.replace(/#\{([^}]+)\}/g, (_,k) => vars[k]);
}
export function guideEligibility(b, settings, at = Date.now(), includeManual = false) {
  if (!b) return '예약을 찾을 수 없습니다.';
  if (b.status !== 'confirmed') return '예약 확정 건만 발송할 수 있습니다.';
  if (!Object.hasOwn(SPACES, b.space_id)) return '공간을 확인해 주세요.';
  const [s,e] = hours(b);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e <= s || e > 47) return '이용 시작·종료 시간을 먼저 확정해 주세요.';
  const end = Date.parse(b.date + 'T00:00:00+09:00') + e * 36e5;
  if (!Number.isFinite(end) || end <= at) return '이용이 종료된 예약입니다.';
  if (!guidePhone(b.phone)) return '알림톡을 받을 수 있는 휴대폰 번호를 확인해 주세요. (050 안심번호 제외)';
  if (!String(b.customer_name || '').trim()) return '예약자 이름을 확인해 주세요.';
  if (!settings.spaces.includes(b.space_id)) return '이 호점의 시설 안내 확인이 필요합니다.';
  if (b.guide_sent && !includeManual) return '기존 현장 안내 발송 체크가 있습니다.';
  return '';
}
async function config(env) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first(), s = parse(row?.value);
  return { enabled: s.enabled === true, automatic: s.automatic === true, template_code: s.template_code == null ? 'UN_2584' : str(s.template_code,60), spaces: Array.isArray(s.spaces) ? s.spaces.filter(x => Object.hasOwn(SPACES,x)) : [] };
}
async function configHash(env,s) { return sha256(JSON.stringify([GUIDE_VERSION,GUIDE_TEMPLATE,GUIDE_BUTTON,s.template_code,s.spaces.slice().sort(),...secrets.map(k=>env[k] || ''),env.ALIGO_RELAY_URL || '',env.ALIGO_RELAY_SECRET || ''])); }
const credentialNames = env => env.ALIGO_RELAY_URL ? ['ALIGO_RELAY_URL','ALIGO_RELAY_SECRET','ALIGO_SENDER_KEY','ALIGO_SENDER'] : secrets;
const missing = env => credentialNames(env).filter(k=>!env[k]);
async function provider(env, path, data = {}, requestID = crypto.randomUUID()) {
  let target='https://kakaoapi.aligo.in/akv10/' + path + '/',headers={'Content-Type':'application/x-www-form-urlencoded'},body;
  if(env.ALIGO_RELAY_URL){
    // Only our dedicated hostname may receive signed requests. API keys stay on the relay.
    if(env.ALIGO_RELAY_URL!=='https://relay.naranhistory.com/megaspot/aligo' || String(env.ALIGO_RELAY_SECRET || '').length<32) throw Error('고정 IP 발송 서버의 주소·서명 키를 확인해 주세요.');
    target=env.ALIGO_RELAY_URL;body=JSON.stringify({path,data,request_id:requestID,time:Date.now()});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ALIGO_RELAY_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))),b=>b.toString(16).padStart(2,'0')).join('');
    headers={'Content-Type':'application/json','X-Megaspot-Signature':signature};
  }else body=new URLSearchParams({apikey:env.ALIGO_API_KEY,userid:env.ALIGO_USERID,...data});
  // Workers supports manual redirects; reject 3xx below instead of following credentials elsewhere.
  const response = await fetch(target, { method:'POST', headers, body, signal:AbortSignal.timeout(10000), redirect:'manual' });
  if (!response.ok) throw Error('알리고 응답을 확인할 수 없습니다.');
  return response.json();
}
function safeProviderError(r) { return '알리고 오류 ' + str(String(r?.code ?? ''),30) + ' — 알리고 설정·잔액과 전송내역에서 사유를 확인해 주세요.'; }
async function approved(env,s) {
  if (missing(env).length || !s.template_code) throw Error('알리고 서버 인증정보와 템플릿 코드를 먼저 설정해 주세요.');
  const r = await provider(env,'template/list',{senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.template_code});
  if (String(r.code) !== '0') throw Error(safeProviderError(r));
  const t = (r.list || []).find(x=>x.templtCode===s.template_code);
  if (!t || t.inspStatus !== 'APR' || !['A','R'].includes(t.status)) throw Error('알리고에서 사용 가능한 승인 템플릿인지 확인해 주세요.');
  const bs = t.buttons || [];
  if (normalize(t.templtContent) !== GUIDE_TEMPLATE || bs.length !== 1 || bs[0].name !== GUIDE_BUTTON.name || bs[0].linkType !== 'WL' || bs[0].linkMo !== GUIDE_URL || bs[0].linkPc !== GUIDE_URL) throw Error('승인 템플릿의 본문·버튼이 준비된 이용 안내와 다릅니다. 템플릿을 확인해 주세요.');
  return t;
}
async function tested(env,hash) { return !!await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE mode='test' AND status='delivered' AND config_hash=? LIMIT 1").bind(hash).first(); }
async function ready(env,s) {
  if (!s.enabled || env.ALIGO_LIVE_ENABLED !== 'true') return '고객 발송이 꺼져 있습니다. 설정에서 준비 상태를 확인해 주세요.';
  if (missing(env).length || !s.template_code) return '알리고 인증정보·템플릿 설정이 필요합니다.';
  if (!await tested(env,await configHash(env,s))) return '현재 설정으로 운영자 시험 수신을 먼저 완료해 주세요.';
  return '';
}
async function booking(env,code) {
  return env.DB.prepare("SELECT b.*, json_extract(ic.checks,'$.guide_sent') AS guide_sent FROM bookings b LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref WHERE b.booking_code=?").bind(code).first();
}
async function active(env,code) { return env.DB.prepare(`SELECT id,status FROM booking_guide_messages WHERE booking_code=? AND mode='live' AND purpose=? AND status IN ${ACTIVE} ORDER BY created_at DESC LIMIT 1`).bind(code,GUIDE_VERSION).first(); }
function snapshot(b) { return { booking_code:b.booking_code, inquiry_ref:b.inquiry_ref || '', customer_name:b.customer_name, phone:guidePhone(b.phone), space_id:b.space_id, date:b.date, time:hours(b), message:guideMessage(b), guide_sent:b.guide_sent || false }; }
function sameSnapshot(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
async function insertMessage(env,b,s,mode,actor,reason='') {
  const id = crypto.randomUUID(), snap = snapshot(b), hash = await configHash(env,s), t = now();
  await env.DB.prepare("INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,actor,reason,created_at,updated_at) VALUES(?,?,?,?, 'queued',?,?,?,?,?,?)").bind(id,mode==='test'?null:b.booking_code,GUIDE_VERSION,mode,JSON.stringify(snap),hash,actor,str(reason,300),t,t).run();
  return id;
}
async function state(env,id,status,error='',mid=null,result=null) {
  await env.DB.prepare('UPDATE booking_guide_messages SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),provider_result=COALESCE(?,provider_result),updated_at=? WHERE id=?').bind(status,str(error,300),mid,result,now(),id).run();
}
async function dispatch(env,id,s,template) {
  const m = await env.DB.prepare('SELECT * FROM booking_guide_messages WHERE id=?').bind(id).first();
  if (!m || m.status !== 'queued') return;
  s=await config(env); // honor an operator's stop/config change during a bulk request
  const snap = parse(m.snapshot);
  if (m.config_hash !== await configHash(env,s)) return state(env,id,'cancelled','발송 설정이 변경되었습니다. 다시 미리보기해 주세요.');
  if (m.mode === 'live') {
    const b = await booking(env,m.booking_code), reason = guideEligibility(b,s,Date.now(),true);
    if (reason || !sameSnapshot(snap,snapshot(b))) return state(env,id,'cancelled',reason || '예약 내용이 변경되었습니다. 다시 미리보기해 주세요.');
    if (await ready(env,s)) return; // safely retain an unsent queue when switched off
  }
  const claim = await env.DB.prepare("UPDATE booking_guide_messages SET status='sending',updated_at=? WHERE id=? AND status='queued'").bind(now(),id).run();
  if (!changed(claim)) return;
  // Never retry a transport/JSON failure: Aligo may already have accepted this request.
  try {
    const r = await provider(env,'alimtalk/send',{senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.template_code,sender:env.ALIGO_SENDER,receiver_1:snap.phone,recvname_1:snap.customer_name,subject_1:'메가스팟 예약 고객 이용 안내',message_1:snap.message.replace(/\n/g,template?.templtContent?.includes('\r\n')?'\r\n':'\n'),button_1:JSON.stringify({button:[GUIDE_BUTTON]}),failover:'N',testMode:'N'},id);
    if (!r || !/^-?\d+$/.test(String(r.code))) return state(env,id,'unknown','알리고 응답 형식 확인이 필요합니다. 재발송 전에 전송내역을 확인해 주세요.');
    if (String(r.code) !== '0') return state(env,id,'failed',safeProviderError(r));
    const mid = r.info?.mid;
    if (!mid || Number(r.info?.scnt)!==1 || Number(r.info?.fcnt || 0)>0) return state(env,id,'unknown','알리고 접수 결과 확인이 필요합니다.',mid?String(mid):null);
    await state(env,id,'accepted','',String(mid));
  } catch { await state(env,id,'unknown','응답을 확인하지 못했습니다. 알리고 전송내역을 확인하기 전에는 재발송하지 마세요.'); }
}
export function guideDelivery(detail) {
  if (!detail || /^Q/.test(String(detail.msgid || '')) || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(detail.rsltdate || '') || !Number.isFinite(Date.parse(detail.rsltdate.replace(' ','T')+'Z')) || detail.rslt == null || detail.rslt==='') return 'accepted';
  if (String(detail.rslt)==='0') return 'delivered';
  // Timeouts/no result are ambiguous; a resend could duplicate delivery.
  if (['5','6'].includes(String(detail.rslt))) return 'unknown';
  return 'failed';
}
async function reconcile(env,id) {
  const m = await env.DB.prepare('SELECT * FROM booking_guide_messages WHERE id=?').bind(id).first();
  if (!m || !['sending','accepted','unknown'].includes(m.status)) return;
  if (!m.provider_mid) {
    if(m.status==='sending' && Date.parse(m.updated_at.replace(' ','T')+'Z')<Date.now()-60000) await state(env,id,'unknown','전송 응답이 남아 있지 않습니다. 알리고 전송내역 확인이 필요합니다.');
    return;
  }
  const s = await config(env);
  if (m.config_hash !== await configHash(env,s)) return; // another account/template cannot prove this delivery
  const r = await provider(env,'history/detail',{mid:m.provider_mid,limit:'50'});
  if (String(r.code)!=='0') throw Error(safeProviderError(r));
  const snap=parse(m.snapshot), d=(r.list || []).find(x=>guidePhone(x.phone)===snap.phone && x.type==='AT' && x.tpl_code===s.template_code && x.senderKey===env.ALIGO_SENDER_KEY);
  const status=guideDelivery(d);
  if (status==='accepted') {
    await env.DB.prepare('UPDATE booking_guide_messages SET updated_at=? WHERE id=?').bind(now(),id).run();
    return;
  }
  await state(env,id,status,status==='delivered'?'':str(d?.rslt_message,240),null,String(d?.rslt || ''));
  // Mark only actual delivery. Preserve unrelated/manual checklist entries atomically.
  if (status==='delivered' && m.mode==='live' && snap.inquiry_ref) {
    await env.DB.prepare("INSERT INTO inquiry_checks(ref,checks,updated_at) VALUES(?,json_object('guide_sent',?),?) ON CONFLICT(ref) DO UPDATE SET checks=json_set(inquiry_checks.checks,'$.guide_sent',?),updated_at=excluded.updated_at").bind(snap.inquiry_ref,now(),now(),now()).run();
  }
}
export async function automaticGuide(env,code) {
  // Called only on a newly confirmed booking, never when deploying or listing old bookings.
  try {
    const s = await config(env); if (!s.automatic || await ready(env,s)) return;
    const b=await booking(env,code); if (guideEligibility(b,s) || await active(env,code)) return;
    const id=await insertMessage(env,b,s,'live','automatic');
    let template;try { template=await approved(env,s); } catch(e) { await state(env,id,'failed',e.message); return; }
    await dispatch(env,id,s,template);
  } catch { /* Booking confirmation must remain successful if the messaging service fails. */ }
}
async function guideLatest(env,codes) {
  if (!codes.length) return {};
  const out={};
  for(let i=0;i<codes.length;i+=80){
    const chunk=codes.slice(i,i+80),{results}=await env.DB.prepare(`SELECT m.booking_code,m.status,m.error,m.provider_result,EXISTS(SELECT 1 FROM booking_guide_messages a WHERE a.booking_code=m.booking_code AND a.purpose=m.purpose AND a.mode='live' AND a.status IN ${ACTIVE}) AS has_active FROM booking_guide_messages m WHERE m.mode='live' AND m.purpose=? AND m.booking_code IN (${chunk.map(()=>'?').join(',')}) ORDER BY m.created_at,m.rowid`).bind(GUIDE_VERSION,...chunk).all();
    for(const x of results || []) out[x.booking_code]=x;
  }
  return out;
}
export async function guideSummary(env,codes) {
  return Object.fromEntries(Object.entries(await guideLatest(env,codes)).map(([code,m])=>[code,m.status]));
}

export async function guideAdmin({env,request,url,path,method}) {
  if (!path.startsWith('guide-messages')) return null;
  const s=await config(env), hash=await configHash(env,s);
  if(path==='guide-messages/count' && method==='GET') {
    const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM booking_guide_messages WHERE mode='live' AND status IN ('failed','unknown','sending','queued')").first();
    return json({ok:true,count:Number(r?.n || 0)});
  }
  if(path==='guide-messages/sync' && method==='POST') {
    if(!missing(env).length){
      const {results}=await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE config_hash=? AND (status='accepted' OR status='sending' OR (status='unknown' AND provider_mid IS NOT NULL)) ORDER BY updated_at,rowid LIMIT 5").bind(hash).all();
      for(const row of results || []) { try { await reconcile(env,row.id); } catch { break; } }
    }
    return json({ok:true});
  }
  if(path==='guide-messages/settings' && method==='GET') return json({ok:true,...s,transport:env.ALIGO_RELAY_URL?'relay':'direct',live_allowed:env.ALIGO_LIVE_ENABLED==='true',credentials:Object.fromEntries(credentialNames(env).map(k=>[k,!!env[k]])),test_delivered:await tested(env,hash),template:GUIDE_TEMPLATE,button:GUIDE_BUTTON,guide_url:GUIDE_URL,version:GUIDE_VERSION});
  if(path==='guide-messages/settings' && method==='PUT') {
    const d=await readJson(request), next={enabled:d.enabled===true,automatic:d.automatic===true,template_code:str(d.template_code,60),spaces:Array.isArray(d.spaces)?d.spaces.filter(x=>Object.hasOwn(SPACES,x)):[]};
    if(next.enabled) { if(env.ALIGO_LIVE_ENABLED!=='true') return err('Cloudflare의 ALIGO_LIVE_ENABLED를 true로 설정한 뒤 활성화할 수 있습니다.',409); await approved(env,next); if(!next.spaces.length || !await tested(env,await configHash(env,next))) return err('호점별 안내 확인과 현재 설정의 운영자 시험 수신을 먼저 완료해 주세요.',409); }
    await env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(KEY,JSON.stringify(next),now()).run();
    return json({ok:true});
  }
  if(path==='guide-messages/check-template' && method==='POST') { await approved(env,s); return json({ok:true,message:'본문·버튼이 일치하는 승인 템플릿입니다.'}); }
  if(path==='guide-messages/test' && method==='POST') {
    const d=await readJson(request), phone=guidePhone(d.phone);
    if(!phone || d.confirm_test!==true) return err('시험 수신할 운영자 휴대폰 번호를 확인해 주세요.');
    const template=await approved(env,s);
    // A real operator test is intentionally distinct from Aligo's non-delivery testMode.
    const recent=await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE mode='test' AND created_at>=? LIMIT 1").bind(new Date(Date.now()-60000).toISOString().slice(0,19).replace('T',' ')).first();
    if(recent) return err('시험 발송은 1분 뒤 다시 요청해 주세요.',429);
    const b={booking_code:'TEST',customer_name:'메가스팟 운영자',phone,space_id:s.spaces[0] || 'megaspot-gundae',date:'2099-01-01',start_h:18,end_h:22};
    const id=await insertMessage(env,b,s,'test','admin','운영자 시험 발송'); await dispatch(env,id,s,template); return json({ok:true,id});
  }
  if(path==='guide-messages/candidates' && method==='GET') {
    const from=str(url.searchParams.get('from'),10),to=str(url.searchParams.get('to'),10),space=str(url.searchParams.get('space'),60),page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));
    const statusFilter=url.searchParams.get('status'),review=['failed','needs_review'].includes(statusFilter);
    const conditions=review?['1=1']:["b.status='confirmed'","b.date>=date('now','+9 hours','-1 day')"], args=[];
    if(from){conditions.push('b.date>=?');args.push(from);} if(to){conditions.push('b.date<=?');args.push(to);} if(space){conditions.push('b.space_id=?');args.push(space);}
    if(url.searchParams.get('status')==='unsent'){
      conditions.push("COALESCE(json_extract(ic.checks,'$.guide_sent'),0)=0");
      conditions.push(`NOT EXISTS (SELECT 1 FROM booking_guide_messages gm WHERE gm.booking_code=b.booking_code AND gm.mode='live' AND gm.purpose=? AND gm.status IN ${ACTIVE})`);
      args.push(GUIDE_VERSION);
    }
    if(review){
      const latest="(SELECT gm.status FROM booking_guide_messages gm WHERE gm.booking_code=b.booking_code AND gm.mode='live' AND gm.purpose=? ORDER BY gm.created_at DESC,gm.rowid DESC LIMIT 1)";
      conditions.push(latest+(statusFilter==='failed'?"='failed'":" IN ('queued','sending','accepted','unknown')"));
      args.push(GUIDE_VERSION);
    }
    const {results}=await env.DB.prepare(`SELECT b.*,json_extract(ic.checks,'$.guide_sent') AS guide_sent FROM bookings b LEFT JOIN inquiry_checks ic ON ic.ref=b.inquiry_ref WHERE ${conditions.join(' AND ')} ORDER BY b.date,b.start_h,b.id LIMIT 101 OFFSET ?`).bind(...args,page*100).all();
    const rows=(results || []).slice(0,100), latest=await guideLatest(env,rows.map(x=>x.booking_code)),items=rows.map(b=>{
      const m=latest[b.booking_code],failed=m?.status==='failed',exclusion=guideEligibility(b,s);
      return {booking_code:b.booking_code,name:b.customer_name,phone:b.phone,date:b.date,space_id:b.space_id,time:hours(b).map(hour).join('~'),guide_sent:!!b.guide_sent,message_status:m?.status || '',exclusion,
        failure_reason:failed?str(m.error,300):'',failure_code:failed?str(m.provider_result,30):'',retry_allowed:failed&&!exclusion&&!m.has_active};
    });
    return json({ok:true,items,has_more:(results || []).length>100});
  }
  if(path==='guide-messages/preview' && method==='POST') {
    const d=await readJson(request),codes=[...new Set(Array.isArray(d.codes)?d.codes:[])];
    if(!codes.length || codes.length>20 || codes.some(x=>typeof x!=='string' || !/^[A-Z0-9-]{1,40}$/.test(x))) return err('예약을 1~20건 선택해 주세요.');
    const include=d.include_manual===true,reason=str(d.reason,300); if(include && !reason) return err('기존 안내 고객에게 다시 안내할 사유를 입력해 주세요.');
    const items=[],excluded=[];
    for(const code of codes){const b=await booking(env,code),why=guideEligibility(b,s,Date.now(),include),previous=await active(env,code); if(why || previous){excluded.push({booking_code:code,reason:why || '이미 발송됐거나 처리 중인 안내가 있습니다.'});continue;} items.push(snapshot(b));}
    const id=crypto.randomUUID(),expires=Date.now()+10*60000;
    await env.DB.prepare('DELETE FROM booking_guide_previews WHERE expires_at<?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO booking_guide_previews(id,payload,expires_at) VALUES(?,?,?)').bind(id,JSON.stringify({items,config_hash:hash,include_manual:include,reason}),expires).run();
    return json({ok:true,preview_id:id,items,excluded,expires_at:expires,blocked:await ready(env,s)});
  }
  if(path==='guide-messages/send' && method==='POST') {
    const d=await readJson(request),p=await env.DB.prepare('SELECT * FROM booking_guide_previews WHERE id=?').bind(str(d.preview_id,60)).first();
    if(d.confirm_send!==true || !p || p.expires_at<Date.now()) return err('미리보기가 만료되었습니다. 다시 확인해 주세요.',409);
    const payload=parse(p.payload); if(payload.config_hash!==hash) return err('발송 설정이 바뀌었습니다. 다시 미리보기해 주세요.',409);
    const block=await ready(env,s); if(block) return err(block,409); const template=await approved(env,s);
    // Consume once, atomically, before any provider request. A repeated click cannot replay it.
    if(!changed(await env.DB.prepare('DELETE FROM booking_guide_previews WHERE id=?').bind(p.id).run())) return err('이미 처리된 미리보기입니다.',409);
    const items=[];let halted=false;
    for(const snap of payload.items || []) {
      if(halted){items.push({booking_code:snap.booking_code,skipped:true,reason:'앞선 발송 결과 확인 또는 발송 재개가 필요하여 보류했습니다.'});continue;}
      const b=await booking(env,snap.booking_code),why=guideEligibility(b,s,Date.now(),payload.include_manual);
      if(why || !sameSnapshot(snap,snapshot(b)) || await active(env,snap.booking_code)){items.push({booking_code:snap.booking_code,skipped:true,reason:why || '예약 내용 또는 발송 이력이 바뀌었습니다.'});continue;}
      try{const id=await insertMessage(env,b,s,'live','admin',payload.reason);await dispatch(env,id,s,template);const row=await env.DB.prepare('SELECT status,error FROM booking_guide_messages WHERE id=?').bind(id).first();items.push({booking_code:b.booking_code,id,...row});halted=['unknown','sending','queued'].includes(row.status);}catch{items.push({booking_code:b.booking_code,skipped:true,reason:'처리 중이거나 저장할 수 없습니다. 이력을 확인해 주세요.'});halted=true;}
    }
    return json({ok:true,items});
  }
  if(path==='guide-messages/history' && method==='GET') {
    const code=str(url.searchParams.get('code'),40),page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));
    const {results}=await env.DB.prepare(`SELECT * FROM booking_guide_messages ${code?'WHERE booking_code=?':''} ORDER BY created_at DESC,id DESC LIMIT 101 OFFSET ?`).bind(...(code?[code]:[]),page*100).all();
    return json({ok:true,items:(results || []).slice(0,100).map(m=>({...m,snapshot:parse(m.snapshot)})),has_more:(results || []).length>100});
  }
  const action=path.match(/^guide-messages\/([a-f0-9-]{36})\/(refresh|resume|not-sent)$/);
  if(action && method==='POST') {
    const [,id,act]=action,m=await env.DB.prepare('SELECT * FROM booking_guide_messages WHERE id=?').bind(id).first(); if(!m) return err('발송 이력이 없습니다.',404);
    if(act==='refresh') await reconcile(env,id);
    if(act==='resume'){const block=await ready(env,s);if(block)return err(block,409);const template=await approved(env,s);await dispatch(env,id,s,template);}
    if(act==='not-sent'){
      const d=await readJson(request);if(!['unknown','sending'].includes(m.status) || d.confirm_not_sent!==true || str(d.reason,300).length<5) return err('알리고 전송내역에서 미접수를 확인한 사유를 입력해 주세요.');
      if(Date.parse(m.updated_at.replace(' ','T')+'Z')>Date.now()-24*36e5)return err('결과가 늦게 도착할 수 있습니다. 요청 후 24시간이 지난 뒤 미발송을 확인해 주세요.',409);
      await state(env,id,'failed','운영자 미발송 확인: '+str(d.reason,250));
    }
    return json({ok:true});
  }
  return err('지원하지 않는 요청입니다.',405);
}

// Shared signed transport; callers retain independent templates, queues and enable switches.
export {provider as aligoProvider};
