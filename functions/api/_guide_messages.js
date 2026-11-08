// Reservation guide Alimtalk. No credentials or public sending routes live in the browser.
import { json, err, now, readJson, str, sha256, SPACES } from './_lib.js';
import {keyReady} from './_deposit_refunds.js';
import {PORTAL_GUIDE_CODE,PORTAL_GUIDE_VARIANT,PORTAL_GUIDE_VERSION,PORTAL_GUIDE_TEMPLATE,PORTAL_GUIDE_BUTTON,PORTAL_GUIDE_URL,portalGuideSnapshot,portalGuideButton,portalGuideSimulation} from './_guide_portal.js';

export const GUIDE_URL = 'https://megaspot-guide.pages.dev/';
export const GUIDE_VERSION = 'reservation-guide-v1';
export const GUIDE_BUTTON = { name: '시설 이용 안내 확인', linkType: 'WL', linkTypeName: '웹링크', linkMo: GUIDE_URL, linkPc: GUIDE_URL };
// Separate reviewed template; keep the active legacy button/fingerprint until switched explicitly.
export const GUIDE_LABEL_CODE = 'UN_3085';
export const GUIDE_LABEL_BUTTON = {...GUIDE_BUTTON,name:'시설·주차·케이터링 안내'};
export const GUIDE_MULTI_CODE = 'UN_3115';
export const GUIDE_MULTI_BUTTONS = [
  {...GUIDE_BUTTON,name:'입실 및 이용 안내'},
  {...GUIDE_BUTTON,name:'뷔페·케이터링·칵테일 안내',linkMo:'https://megaspot.kr/catering/#food-compare',linkPc:'https://megaspot.kr/catering/#food-compare'},
  {...GUIDE_BUTTON,name:'주차권 구매',linkMo:'https://megaspot.kr/parking/purchase/',linkPc:'https://megaspot.kr/parking/purchase/'}
];
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
export const GUIDE_MULTI_TEMPLATE = GUIDE_TEMPLATE+'\n\n입실·시설 이용 방법, 식음료 서비스, 주차권 구매는\n아래 버튼에서 확인해 주세요.';
function profile(s){
  if(s.variant===PORTAL_GUIDE_VARIANT)return {template:PORTAL_GUIDE_TEMPLATE,button:PORTAL_GUIDE_BUTTON,url:PORTAL_GUIDE_URL,version:PORTAL_GUIDE_VERSION,subject:'메가스팟 예약 확정 안내'};
  const base={template:GUIDE_TEMPLATE,button:s.template_code===GUIDE_LABEL_CODE?GUIDE_LABEL_BUTTON:GUIDE_BUTTON,url:GUIDE_URL,version:GUIDE_VERSION,subject:'메가스팟 예약 고객 이용 안내'};
  return s.template_code===GUIDE_MULTI_CODE?{...base,template:GUIDE_MULTI_TEMPLATE,button:GUIDE_MULTI_BUTTONS[0],buttons:GUIDE_MULTI_BUTTONS}:base;
}
const NORMAL_SLOTS = { 'pkg-day': [10,17], 'pkg-allday': [10,24], 'pkg-allnight': [18,31], morning:[7,12], day:[12,17], evening:[17,24], am:[9,13], pm:[13,18], ev:[18,23], ampm:[9,18], pmev:[14,23] };
const KEY = 'reservation_guide';
const ACTIVE = "('queued','sending','accepted','unknown','delivered')";
const FAMILY = "(purpose='reservation-guide-v1' OR purpose GLOB 'reservation-guide-v1:r[0-9]*')";
const REVISION = 'COALESCE(gs.revision,0)';
const PURPOSE = "'reservation-guide-v1'||CASE WHEN COALESCE(gs.revision,0)=0 THEN '' ELSE ':r'||gs.revision END";
const MANUAL = 'CASE WHEN gs.manual_revision=gs.revision THEN gs.manual_sent ELSE NULL END';
const BOOKING_JOIN = 'FROM bookings b LEFT JOIN booking_guide_state gs ON gs.booking_code=b.booking_code';
function purpose(b) { return GUIDE_VERSION + (b.revision ? ':r' + b.revision : ''); }
const secrets = ['ALIGO_USERID','ALIGO_API_KEY','ALIGO_SENDER_KEY','ALIGO_SENDER'];
const parse = (raw, fallback = {}) => { try { return JSON.parse(raw) || fallback; } catch { return fallback; } };
const changed = r => Number(r?.meta?.changes ?? r?.changes ?? 0);
const normalize = s => String(s || '').replace(/\r\n/g, '\n');
export function guidePhone(p) { let s = String(p || '').replace(/\D/g, ''); if (s.startsWith('82')) s = '0' + s.slice(2); return /^01[016789]\d{7,8}$/.test(s) ? s : ''; }
function hours(b) { return b.start_h != null && b.end_h != null ? [Number(b.start_h), Number(b.end_h)] : NORMAL_SLOTS[b.slot] || []; }
function hour(h) { return (h >= 24 ? '다음날 ' : '') + String(Math.floor(h % 24)).padStart(2,'0') + ':' + String(Math.round((h % 1) * 60)).padStart(2,'0'); }
export function guideMessage(b,template=GUIDE_TEMPLATE) {
  const [s,e] = hours(b), vars = { 고객명: String(b.customer_name || '').replace(/[\r\n\t]/g, ' ').trim(), 공간명: SPACES[b.space_id] || '', 이용일: String(b.date || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일'), 이용시간: s == null ? '' : hour(s) + '~' + hour(e) };
  return template.replace(/#\{([^}]+)\}/g, (_,k) => vars[k]);
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
  return { variant:s.variant===PORTAL_GUIDE_VARIANT?PORTAL_GUIDE_VARIANT:'legacy', enabled: s.enabled === true, automatic: s.automatic === true, template_code: s.template_code == null ? 'UN_2584' : str(s.template_code,60), spaces: Array.isArray(s.spaces) ? s.spaces.filter(x => Object.hasOwn(SPACES,x)) : [] };
}
function candidateTestConfig(d) {
  if(d?.variant!=='legacy' || !str(d.template_code,60) || !Array.isArray(d.spaces) || !d.spaces.length || d.spaces.some(x=>!Object.hasOwn(SPACES,x))) throw Error('시험할 시설 안내 템플릿과 호점을 확인해 주세요.');
  return {variant:'legacy',template_code:str(d.template_code,60),spaces:[...new Set(d.spaces)],enabled:false,automatic:false};
}
async function deliveryConfig(env,m,snap) {
  // Only an explicitly requested operator test may use an unsaved configuration.
  return m.mode==='test' && snap.test_config ? candidateTestConfig(snap.test_config) : config(env);
}
async function configHash(env,s) { const p=profile(s),values=[p.version,p.template,p.button,s.template_code,s.spaces.slice().sort(),...secrets.map(k=>env[k] || ''),env.ALIGO_RELAY_URL || '',env.ALIGO_RELAY_SECRET || ''];if(p.buttons)values.push(p.buttons);if(s.variant===PORTAL_GUIDE_VARIANT)values.push(await sha256(env.DEPOSIT_ACCOUNT_KEY||''));return sha256(JSON.stringify(values)); }
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
  if (!response.ok) throw Object.assign(Error('알리고 응답을 확인할 수 없습니다.'),{status:response.status});
  return response.json();
}
function safeProviderError(r) { return '알리고 오류 ' + str(String(r?.code ?? ''),30) + ' — 알리고 설정·잔액과 전송내역에서 사유를 확인해 주세요.'; }
async function approved(env,s) {
  if (missing(env).length || !s.template_code) throw Error('알리고 서버 인증정보와 템플릿 코드를 먼저 설정해 주세요.');
  const r = await provider(env,'template/list',{senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.template_code});
  if (String(r.code) !== '0') throw Error(safeProviderError(r));
  const t = (r.list || []).find(x=>x.templtCode===s.template_code);
  if (!t || t.inspStatus !== 'APR' || !['A','R'].includes(t.status)) throw Error('알리고에서 사용 가능한 승인 템플릿인지 확인해 주세요.');
  const bs = t.buttons || [],p=profile(s),expected=p.buttons||[p.button];
  if (normalize(t.templtContent) !== p.template || bs.length !== expected.length || !bs.every((b,i)=>b.name===expected[i].name && b.linkType==='WL' && b.linkMo===expected[i].linkMo && b.linkPc===expected[i].linkPc)) throw Error('승인 템플릿의 본문·버튼이 준비된 이용 안내와 다릅니다. 템플릿을 확인해 주세요.');
  return t;
}
async function tested(env,hash) { return !!await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE mode='test' AND status='delivered' AND config_hash=? LIMIT 1").bind(hash).first(); }
async function ready(env,s) {
  if(s.variant===PORTAL_GUIDE_VARIANT&&!keyReady(env))return '통합 안내 링크 암호화 설정이 필요합니다.';
  if (!s.enabled || env.ALIGO_LIVE_ENABLED !== 'true') return '고객 발송이 꺼져 있습니다. 설정에서 준비 상태를 확인해 주세요.';
  if (missing(env).length || !s.template_code) return '알리고 인증정보·템플릿 설정이 필요합니다.';
  if (!await tested(env,await configHash(env,s))) return '현재 설정으로 운영자 시험 수신을 먼저 완료해 주세요.';
  return '';
}
async function booking(env,code) {
  return env.DB.prepare(`SELECT b.*,${REVISION} AS revision,COALESCE(gs.needs_review,0) AS needs_review,${MANUAL} AS guide_sent ${BOOKING_JOIN} WHERE b.booking_code=?`).bind(code).first();
}
export async function guideInquiryChecks(env,ref,checks) {
  const any=await env.DB.prepare("SELECT 1 FROM bookings WHERE inquiry_ref=? AND status<>'cancelled' LIMIT 1").bind(ref).first();
  if(!any)return checks;
  const outstanding=await env.DB.prepare(`SELECT 1 ${BOOKING_JOIN} WHERE b.inquiry_ref=? AND b.status<>'cancelled' AND COALESCE(${MANUAL},0)=0 AND NOT EXISTS(SELECT 1 FROM booking_guide_messages gm WHERE gm.booking_code=b.booking_code AND gm.mode='live' AND gm.purpose=${PURPOSE} AND gm.status='delivered') LIMIT 1`).bind(ref).first();
  return {...checks,guide_sent:outstanding?false:(checks.guide_sent || true)};
}
async function active(env,b) {
  if(!b)return null;
  // Old in-flight/ambiguous requests block all revisions until their outcome is known.
  return env.DB.prepare(`SELECT id,status FROM booking_guide_messages WHERE booking_code=? AND mode='live' AND ${FAMILY} AND ((purpose=? AND status IN ${ACTIVE}) OR status IN ('sending','accepted','unknown')) ORDER BY created_at DESC,rowid DESC LIMIT 1`).bind(b.booking_code,purpose(b)).first();
}
function snapshot(b) { return { booking_code:b.booking_code, revision:b.revision || 0, inquiry_ref:b.inquiry_ref || '', customer_name:b.customer_name, phone:guidePhone(b.phone), space_id:b.space_id, date:b.date, time:hours(b), message:guideMessage(b), guide_sent:b.guide_sent || false }; }
async function messageSnapshot(env,b,s,issue=false){const snap=snapshot(b);if(s.variant===PORTAL_GUIDE_VARIANT)return portalGuideSnapshot(env,b,snap,issue);snap.message=guideMessage(b,profile(s).template);return snap;}
async function presentSnapshot(env,snap,s={}){if(snap.delivery_variant!==PORTAL_GUIDE_VARIANT){const p=profile(s);return {...snap,button:p.button,buttons:p.buttons||[p.button],guide_url:GUIDE_URL};}const button=await portalGuideButton(env,snap);return {...snap,button,buttons:[button],guide_url:button.linkMo};}
function providerPayload(env,s,snap,template,button){return {senderkey:env.ALIGO_SENDER_KEY,tpl_code:s.template_code,sender:env.ALIGO_SENDER,receiver_1:snap.phone,recvname_1:snap.customer_name,subject_1:profile(s).subject,message_1:snap.message.replace(/\n/g,template?.templtContent?.includes('\r\n')?'\r\n':'\n'),button_1:JSON.stringify({button:Array.isArray(button)?button:[button]}),failover:'N',testMode:'N'};}
function sameSnapshot(a,b) { const keys=[...new Set([...Object.keys(a),...Object.keys(b),'revision'])].sort();return keys.every(k=>JSON.stringify(k==='revision'?(a[k] || 0):a[k])===JSON.stringify(k==='revision'?(b[k] || 0):b[k])); }
async function insertMessage(env,b,s,mode,actor,reason='',event=null,expectedSnapshot=null) {
  const id = crypto.randomUUID(), snap = expectedSnapshot||await messageSnapshot(env,b,s,s.variant===PORTAL_GUIDE_VARIANT), hash = await configHash(env,s), t = now();
  const values=[id,mode==='test'?null:b.booking_code,purpose(b),mode,JSON.stringify(snap),hash,actor,str(reason,300),t,t];
  const insert=env.DB.prepare("INSERT INTO booking_guide_messages(id,booking_code,purpose,mode,status,snapshot,config_hash,actor,reason,created_at,updated_at) SELECT ?,?,?,?, 'queued',?,?,?,?,?,?"+(event?" WHERE EXISTS(SELECT 1 FROM booking_guide_events WHERE booking_code=? AND revision=? AND status='pending')":"")).bind(...values,...(event?[b.booking_code,b.revision]:[]));
  if(event){
    const results=await env.DB.batch([insert,env.DB.prepare("UPDATE booking_guide_events SET status='handled',message_id=? WHERE booking_code=? AND revision=? AND status='pending'").bind(id,b.booking_code,b.revision)]);
    if(!changed(results[0]))return null;
  }
  else await insert.run();
  return id;
}
async function state(env,id,status,error='',mid=null,result=null) {
  await env.DB.prepare('UPDATE booking_guide_messages SET status=?,error=?,provider_mid=COALESCE(?,provider_mid),provider_result=COALESCE(?,provider_result),updated_at=? WHERE id=?').bind(status,str(error,300),mid,result,now(),id).run();
}
async function dispatch(env,id,s,template) {
  const m = await env.DB.prepare('SELECT * FROM booking_guide_messages WHERE id=?').bind(id).first();
  if (!m || m.status !== 'queued') return;
  const snap = parse(m.snapshot);
  s=await deliveryConfig(env,m,snap); // live messages always honor the persisted stop/config settings
  if (m.config_hash !== await configHash(env,s)) return state(env,id,'cancelled','발송 설정이 변경되었습니다. 다시 미리보기해 주세요.');
  const isPortal=snap.delivery_variant===PORTAL_GUIDE_VARIANT;let currentBooking,button=profile(s).buttons||profile(s).button;
  if (m.mode === 'live'||isPortal) {
    const b=currentBooking=await booking(env,m.booking_code||snap.booking_code), reason = guideEligibility(b,s,Date.now(),true);
    let fresh;try{if(!reason)fresh=await messageSnapshot(env,b,s);}catch{return state(env,id,'cancelled','통합 안내 링크가 만료되었거나 변경되었습니다. 새로 미리보기해 주세요.');}
    if (reason || !sameSnapshot(snap,fresh)) return state(env,id,'cancelled',reason || '예약 내용 또는 통합 링크가 변경되었습니다. 다시 미리보기해 주세요.');
    if (m.mode==='live'&&await ready(env,s)) return; // safely retain an unsent queue when switched off
  }
  if(isPortal)try{button=await portalGuideButton(env,snap);}catch{return state(env,id,'cancelled','통합 안내 링크가 변경되었습니다. 새로 미리보기해 주세요.');}
  const ref=snap.portal_reference,guard=isPortal?" AND EXISTS(SELECT 1 FROM booking_portal_links pl JOIN bookings pb ON pb.booking_code=pl.booking_code WHERE pl.booking_code=? AND pl.token_hash=? AND pl.version=? AND pl.recipient_hash=? AND pl.expires_at>? AND pb.status='confirmed' AND pb.phone IS ? AND pb.customer_name IS ?)":'';
  const claim = await env.DB.prepare("UPDATE booking_guide_messages SET status='sending',updated_at=? WHERE id=? AND status='queued'"+guard).bind(now(),id,...(isPortal?[snap.booking_code,ref.token_hash,ref.version,ref.recipient_hash,Date.now(),currentBooking.phone,currentBooking.customer_name]:[])).run();
  if (!changed(claim)){if(isPortal)await env.DB.prepare("UPDATE booking_guide_messages SET status='cancelled',error='통합 안내 링크 또는 예약이 변경되었습니다.',updated_at=? WHERE id=? AND status='queued'").bind(now(),id).run();return;}
  // Never retry a transport/JSON failure: Aligo may already have accepted this request.
  try {
    const r = await provider(env,'alimtalk/send',providerPayload(env,s,snap,template,button),id);
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
  const snap=parse(m.snapshot),s = await deliveryConfig(env,m,snap);
  if (m.config_hash !== await configHash(env,s)) return; // another account/template cannot prove this delivery
  const r = await provider(env,'history/detail',{mid:m.provider_mid,limit:'50'});
  if (String(r.code)!=='0') throw Error(safeProviderError(r));
  const d=(r.list || []).find(x=>guidePhone(x.phone)===snap.phone && x.type==='AT' && x.tpl_code===s.template_code && x.senderKey===env.ALIGO_SENDER_KEY);
  const status=guideDelivery(d);
  if (status==='accepted') {
    await env.DB.prepare('UPDATE booking_guide_messages SET updated_at=? WHERE id=?').bind(now(),id).run();
    return;
  }
  await state(env,id,status,status==='delivered'?'':str(d?.rslt_message,240),null,String(d?.rslt || ''));
  if (status==='delivered' && m.mode==='live') {
    await env.DB.prepare('UPDATE booking_guide_state SET needs_review=0 WHERE booking_code=? AND revision=?').bind(m.booking_code,snap.revision || 0).run();
    // Inquiry checks are an aggregate, never evidence that an unsent sibling was guided.
    if(snap.inquiry_ref){
      // The aggregate check and write are one statement, so a concurrent sibling insert cannot inherit it.
      await env.DB.prepare(`INSERT INTO inquiry_checks(ref,checks,updated_at) SELECT ?,json_object('guide_sent',?),? WHERE NOT EXISTS(SELECT 1 ${BOOKING_JOIN} WHERE b.inquiry_ref=? AND b.status<>'cancelled' AND COALESCE(${MANUAL},0)=0 AND NOT EXISTS(SELECT 1 FROM booking_guide_messages gm WHERE gm.booking_code=b.booking_code AND gm.mode='live' AND gm.purpose=${PURPOSE} AND gm.status='delivered')) ON CONFLICT(ref) DO UPDATE SET checks=json_set(inquiry_checks.checks,'$.guide_sent',?),updated_at=excluded.updated_at`).bind(snap.inquiry_ref,now(),now(),snap.inquiry_ref,now()).run();
    }
  }
}
export async function automaticGuide(env,code) {
  // Every creation path writes the same transactional event. Never scan/backfill old bookings.
  try {
    const b=await booking(env,code);if(!b)return;
    const event=await env.DB.prepare("SELECT * FROM booking_guide_events WHERE booking_code=? AND revision=? AND status IN ('pending','handled')").bind(code,b.revision).first();
    if(!event)return;
    const s=await config(env);
    if(!s.automatic || !s.enabled || env.ALIGO_LIVE_ENABLED!=='true'){
      await env.DB.prepare("UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=? AND revision=? AND status='pending'").bind(code,b.revision).run();
      if(event.message_id)await env.DB.prepare("UPDATE booking_guide_messages SET status='cancelled',error='자동 발송 중지',updated_at=? WHERE id=? AND status='queued'").bind(now(),event.message_id).run();return;
    }
    if(await ready(env,s))return; // Keep an observable event on transient readiness/storage failure.
    if(b.needs_review || guideEligibility(b,s)){
      await env.DB.prepare("UPDATE booking_guide_events SET status='cancelled' WHERE booking_code=? AND revision=? AND status='pending'").bind(code,b.revision).run();return;
    }
    let id=event.message_id;
    if(!id){
      if(event.status!=='pending')return;
      if(await active(env,b)){
        await env.DB.prepare("UPDATE booking_guide_events SET status='handled' WHERE booking_code=? AND revision=? AND status='pending'").bind(code,b.revision).run();return;
      }
      id=await insertMessage(env,b,s,'live','automatic','',event);
      if(!id)return;
    }
    const m=await env.DB.prepare('SELECT status FROM booking_guide_messages WHERE id=?').bind(id).first();if(m?.status!=='queued')return;
    let template;try { template=await approved(env,s); } catch(e) { await state(env,id,'failed',e.message); return; }
    await dispatch(env,id,s,template);
  } catch { /* Durable events survive: a messaging failure must not roll back a booking/payment. */ }
}
export async function confirmedGuide(env,code,waitUntil) {
  if(typeof waitUntil==='function'){waitUntil(automaticGuide(env,code));return;}
  await automaticGuide(env,code);
}
export async function guideTick(env,send=true) {
  if(!env.DB)return;
  const until=Date.now()+120000;
  const claim=await env.DB.prepare("INSERT INTO booking_guide_lease(name,until_at) VALUES('tick',?) ON CONFLICT(name) DO UPDATE SET until_at=excluded.until_at WHERE booking_guide_lease.until_at<?").bind(until,Date.now()).run();
  if(!changed(claim))return;
  try{
    const s=await config(env),hash=await configHash(env,s);
    if(!missing(env).length){
      const {results}=await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE config_hash=? AND (status IN ('accepted','sending') OR (status='unknown' AND provider_mid IS NOT NULL)) ORDER BY updated_at,rowid LIMIT 5").bind(hash).all();
      for(const m of results || [])try{await reconcile(env,m.id);}catch{break;}
    }
    if(!send)return;
    const {results}=await env.DB.prepare("SELECT e.booking_code FROM booking_guide_events e LEFT JOIN booking_guide_messages m ON m.id=e.message_id WHERE e.status='pending' OR (e.status='handled' AND m.status='queued' AND m.actor='automatic') ORDER BY e.created_at,e.booking_code LIMIT 5").all();
    for(const e of results || [])await automaticGuide(env,e.booking_code);
  }finally{await env.DB.prepare("UPDATE booking_guide_lease SET until_at=? WHERE name='tick' AND until_at=?").bind(Date.now()+60000,until).run();}
}
async function guideLatest(env,codes) {
  if(!codes.length)return {};
  const out={};
  for(let i=0;i<codes.length;i+=80){
    const chunk=codes.slice(i,i+80),{results}=await env.DB.prepare(`SELECT m.booking_code,m.status,m.error,m.provider_result,EXISTS(SELECT 1 FROM booking_guide_messages a WHERE a.booking_code=m.booking_code AND a.mode='live' AND (a.purpose=${PURPOSE} OR ((a.purpose='reservation-guide-v1' OR a.purpose GLOB 'reservation-guide-v1:r[0-9]*') AND a.status IN ('sending','accepted','unknown'))) AND a.status IN ${ACTIVE}) AS has_active FROM booking_guide_messages m LEFT JOIN booking_guide_state gs ON gs.booking_code=m.booking_code WHERE m.mode='live' AND (m.purpose=${PURPOSE} OR ((m.purpose='reservation-guide-v1' OR m.purpose GLOB 'reservation-guide-v1:r[0-9]*') AND m.status IN ('sending','accepted','unknown'))) AND m.booking_code IN (${chunk.map(()=>'?').join(',')}) ORDER BY m.created_at,m.rowid`).bind(...chunk).all();
    for(const x of results || [])out[x.booking_code]=x;
  }
  return out;
}
export async function guideSummary(env,codes) {
  const out=Object.fromEntries(Object.entries(await guideLatest(env,codes)).map(([code,m])=>[code,m.status]));
  for(let i=0;i<codes.length;i+=80){const chunk=codes.slice(i,i+80),{results}=await env.DB.prepare(`SELECT booking_code FROM booking_guide_state WHERE needs_review=1 AND booking_code IN (${chunk.map(()=>'?').join(',')})`).bind(...chunk).all();for(const r of results || [])if(!out[r.booking_code])out[r.booking_code]='changed';}
  return out;
}

export async function guideAdmin({env,request,url,path,method}) {
  if (!path.startsWith('guide-messages')) return null;
  const s=await config(env), hash=await configHash(env,s);
  if(path==='guide-messages/portal-template'&&method==='GET')return json({ok:true,variant:PORTAL_GUIDE_VARIANT,version:PORTAL_GUIDE_VERSION,template_code:PORTAL_GUIDE_CODE,template:PORTAL_GUIDE_TEMPLATE,button:PORTAL_GUIDE_BUTTON,active_variant:s.variant,active_template_code:s.template_code});
  if(path==='guide-messages/portal-check-template'&&method==='POST'){
    const d=await readJson(request),code=str(d.template_code,60);if(!code)return err('새 통합 안내 템플릿 코드를 입력해 주세요.');
    await approved(env,{...s,variant:PORTAL_GUIDE_VARIANT,template_code:code});
    return json({ok:true,approved:true,message:'통합 안내의 승인 본문과 동적 버튼이 일치합니다. 기존 발송 설정은 변경하지 않았습니다.'});
  }
  if(['guide-messages/portal-preview','guide-messages/portal-test'].includes(path)&&method==='POST'){
    const d=await readJson(request),codes=[...new Set(Array.isArray(d.codes)?d.codes:[])],simulation=path.endsWith('/portal-test');
    if(!codes.length||codes.length>20||codes.some(x=>typeof x!=='string'||!/^[A-Z0-9-]{1,40}$/.test(x)))return err('예약을 1~20건 선택해 주세요.');
    if(d.confirm_prepare_links!==true||simulation&&d.confirm_simulation!==true)return err('실제 발송 없는 링크 미리보기·모의시험을 확인해 주세요.');
    const items=[],excluded=[];
    for(const code of codes){
      const b=await booking(env,code),why=guideEligibility(b,{...s,spaces:Object.keys(SPACES)},Date.now(),true);
      if(why){excluded.push({booking_code:code,reason:why});continue;}
      try{
        const snap=await messageSnapshot(env,b,{...s,variant:PORTAL_GUIDE_VARIANT},true),shown=await presentSnapshot(env,snap);
        if(simulation){
          const checks=await portalGuideSimulation(env,snap,shown.button),payload=providerPayload({}, {...s,variant:PORTAL_GUIDE_VARIANT,template_code:str(d.template_code,60)||'(신규 승인 코드 필요)'},snap,{templtContent:PORTAL_GUIDE_TEMPLATE},shown.button);
          const {senderkey,sender,...safePayload}=payload;
          items.push({...shown,checks:{...checks,template_variables_resolved:!/#\{[^}]+\}/.test(safePayload.message_1+safePayload.button_1),external_send_called:false},provider_payload:safePayload});
        }else items.push(shown);
      }catch(e){excluded.push({booking_code:code,reason:e.message});}
    }
    return json({ok:true,mode:simulation?'simulation':'preview',sendable:false,actual_delivery_tested:false,provider_approval_verified:false,items,excluded,passed:simulation&&items.length===codes.length&&items.every(x=>x.checks.template_variables_resolved),blocked:'실제 발송 없는 준비 화면입니다. 새 템플릿 승인·운영자 실제 수신 확인·별도 설정 적용 전에는 현재 발송 방식이 유지됩니다.'});
  }
  if(path==='guide-messages/diagnostics' && method==='GET') {
    // Read-only release check: no provider calls, recipient data, enqueue or dispatch.
    const expected=['booking_guide_state','booking_guide_events','booking_guide_lease','guide_booking_created','guide_booking_changed','guide_booking_status','guide_manual_insert','guide_manual_update','guide_manual_delete','booking_deposit_review'];
    const {results:objects}=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${expected.map(()=>'?').join(',')})`).bind(...expected).all();
    const have=new Set((objects || []).map(x=>x.name)),missingObjects=expected.filter(x=>!have.has(x));
    if(missingObjects.length)return json({ok:true,schema_ok:false,missing:missingObjects});
    const {results:events}=await env.DB.prepare('SELECT status,COUNT(*) AS count FROM booking_guide_events GROUP BY status').all();
    const {results:messages}=await env.DB.prepare(`SELECT status,COUNT(*) AS count FROM booking_guide_messages WHERE mode='live' AND ${FAMILY} GROUP BY status`).all();
    const code=str(url.searchParams.get('code'),40);let item=null;
    if(code&&/^[A-Z0-9-]{1,40}$/.test(code)){
      const b=await booking(env,code);
      if(b){const {results}=await env.DB.prepare('SELECT revision,status FROM booking_guide_events WHERE booking_code=? ORDER BY revision').bind(code).all();item={booking_code:code,status:b.status,revision:b.revision,needs_review:!!b.needs_review,manual_sent:!!b.guide_sent,events:results || []};}
    }
    return json({ok:true,schema_ok:true,missing:[],enabled:s.enabled,automatic:s.automatic,template_code:s.template_code,events:events || [],messages:messages || [],item});
  }
  if(path==='guide-messages/count' && method==='GET') {
    const r=await env.DB.prepare("SELECT COUNT(*) AS n FROM booking_guide_messages WHERE mode='live' AND status IN ('failed','unknown','sending','queued')").first();
    const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM booking_guide_events WHERE status='pending'").first();
    const review=await env.DB.prepare("SELECT COUNT(*) AS n FROM booking_guide_state gs JOIN bookings b ON b.booking_code=gs.booking_code WHERE gs.needs_review=1 AND b.status='confirmed'").first();
    return json({ok:true,count:Number(r?.n || 0)+Number(pending?.n || 0)+Number(review?.n || 0)});
  }
  if(path==='guide-messages/sync' && method==='POST') {
    if(!missing(env).length){
      const {results}=await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE config_hash=? AND (status='accepted' OR status='sending' OR (status='unknown' AND provider_mid IS NOT NULL)) ORDER BY updated_at,rowid LIMIT 5").bind(hash).all();
      for(const row of results || []) { try { await reconcile(env,row.id); } catch { break; } }
    }
    return json({ok:true});
  }
  if(path==='guide-messages/settings' && method==='GET') return json({ok:true,...s,transport:env.ALIGO_RELAY_URL?'relay':'direct',live_allowed:env.ALIGO_LIVE_ENABLED==='true',credentials:Object.fromEntries(credentialNames(env).map(k=>[k,!!env[k]])),test_delivered:await tested(env,hash),template:profile(s).template,button:profile(s).button,guide_url:profile(s).url,version:profile(s).version,templates:{legacy:profile({...s,variant:'legacy'}),'booking-portal':profile({variant:PORTAL_GUIDE_VARIANT})},facility_templates:{[GUIDE_LABEL_CODE]:profile({variant:'legacy',template_code:GUIDE_LABEL_CODE}),[GUIDE_MULTI_CODE]:profile({variant:'legacy',template_code:GUIDE_MULTI_CODE})},portal_template:{code:PORTAL_GUIDE_CODE,variant:PORTAL_GUIDE_VARIANT,template:PORTAL_GUIDE_TEMPLATE,button:PORTAL_GUIDE_BUTTON,version:PORTAL_GUIDE_VERSION}});
  if(path==='guide-messages/settings' && method==='PUT') {
    const d=await readJson(request),variant=d.variant??s.variant;if(!['legacy',PORTAL_GUIDE_VARIANT].includes(variant))return err('안내 방식을 확인해 주세요.');
    const next={variant,enabled:d.enabled===true,automatic:d.automatic===true,template_code:str(d.template_code,60),spaces:Array.isArray(d.spaces)?d.spaces.filter(x=>Object.hasOwn(SPACES,x)):[]};
    if(next.enabled) { if(env.ALIGO_LIVE_ENABLED!=='true') return err('Cloudflare의 ALIGO_LIVE_ENABLED를 true로 설정한 뒤 활성화할 수 있습니다.',409); await approved(env,next); if(!next.spaces.length || !await tested(env,await configHash(env,next))) return err('호점별 안내 확인과 현재 설정의 운영자 시험 수신을 먼저 완료해 주세요.',409); }
    const statements=[env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(KEY,JSON.stringify(next),now())];
    if(!next.enabled || !next.automatic || await configHash(env,next)!==hash){
      statements.push(env.DB.prepare("UPDATE booking_guide_events SET status='cancelled' WHERE status='pending'"));
      statements.push(env.DB.prepare("UPDATE booking_guide_messages SET status='cancelled',error='자동 발송 설정 변경',updated_at=? WHERE mode='live' AND actor='automatic' AND status='queued'").bind(now()));
    }
    await env.DB.batch(statements);
    return json({ok:true});
  }
  if(path==='guide-messages/check-template' && method==='POST') { await approved(env,s); return json({ok:true,message:'본문·버튼이 일치하는 승인 템플릿입니다.'}); }
  if(path==='guide-messages/test' && method==='POST') {
    const d=await readJson(request), phone=guidePhone(d.phone);
    if(!phone || d.confirm_test!==true) return err('시험 수신할 운영자 휴대폰 번호를 확인해 주세요.');
    const testSettings=d.candidate ? candidateTestConfig(d.candidate) : s;
    const template=await approved(env,testSettings);
    // A real operator test is intentionally distinct from Aligo's non-delivery testMode.
    const recent=await env.DB.prepare("SELECT id FROM booking_guide_messages WHERE mode='test' AND created_at>=? LIMIT 1").bind(new Date(Date.now()-60000).toISOString().slice(0,19).replace('T',' ')).first();
    if(recent) return err('시험 발송은 1분 뒤 다시 요청해 주세요.',429);
    let b={booking_code:'TEST',customer_name:'메가스팟 운영자',phone,space_id:testSettings.spaces[0] || 'megaspot-gundae',date:'2099-01-01',start_h:18,end_h:22};
    if(testSettings.variant===PORTAL_GUIDE_VARIANT){b=await booking(env,str(d.booking_code,40));if(!b||guidePhone(b.phone)!==phone||d.confirm_private_preview!==true||guideEligibility(b,testSettings,Date.now(),true))return err('시험 수신 번호와 연락처가 같은 운영자 본인 예약을 지정하고 전용 링크 전달을 확인해 주세요.',409);}
    const testSnapshot=d.candidate ? {...await messageSnapshot(env,b,testSettings),test_config:testSettings} : null;
    const id=await insertMessage(env,b,testSettings,'test','admin','운영자 시험 발송',null,testSnapshot); await dispatch(env,id,testSettings,template); return json({ok:true,id});
  }
  if(path==='guide-messages/candidates' && method==='GET') {
    const from=str(url.searchParams.get('from'),10),to=str(url.searchParams.get('to'),10),space=str(url.searchParams.get('space'),60),page=Math.max(0,Math.min(100000,Number(url.searchParams.get('page'))||0));
    const statusFilter=url.searchParams.get('status'),review=['failed','needs_review'].includes(statusFilter);
    const conditions=review?['1=1']:["b.status='confirmed'","b.date>=date('now','+9 hours','-1 day')"], args=[];
    if(from){conditions.push('b.date>=?');args.push(from);} if(to){conditions.push('b.date<=?');args.push(to);} if(space){conditions.push('b.space_id=?');args.push(space);}
    if(url.searchParams.get('status')==='unsent'){
      conditions.push(`COALESCE(${MANUAL},0)=0`);
      conditions.push(`NOT EXISTS (SELECT 1 FROM booking_guide_messages gm WHERE gm.booking_code=b.booking_code AND gm.mode='live' AND ((gm.purpose=${PURPOSE} AND gm.status IN ${ACTIVE}) OR ((gm.purpose='reservation-guide-v1' OR gm.purpose GLOB 'reservation-guide-v1:r[0-9]*') AND gm.status IN ('sending','accepted','unknown'))))`);
    }
    if(statusFilter==='changed')conditions.push('gs.needs_review=1');
    if(review){
      const latest=`(SELECT gm.status FROM booking_guide_messages gm WHERE gm.booking_code=b.booking_code AND gm.mode='live' AND (gm.purpose=${PURPOSE} OR ((gm.purpose='reservation-guide-v1' OR gm.purpose GLOB 'reservation-guide-v1:r[0-9]*') AND gm.status IN ('sending','accepted','unknown'))) ORDER BY gm.created_at DESC,gm.rowid DESC LIMIT 1)`;
      conditions.push(latest+(statusFilter==='failed'?"='failed'":" IN ('queued','sending','accepted','unknown')"));
    }
    const {results}=await env.DB.prepare(`SELECT b.*,${REVISION} AS revision,COALESCE(gs.needs_review,0) AS needs_review,${MANUAL} AS guide_sent ${BOOKING_JOIN} WHERE ${conditions.join(' AND ')} ORDER BY b.date,b.start_h,b.id LIMIT 101 OFFSET ?`).bind(...args,page*100).all();
    const rows=(results || []).slice(0,100), latest=await guideLatest(env,rows.map(x=>x.booking_code)),items=rows.map(b=>{
      const m=latest[b.booking_code],failed=m?.status==='failed',exclusion=guideEligibility(b,s);
      return {booking_code:b.booking_code,name:b.customer_name,phone:b.phone,date:b.date,space_id:b.space_id,time:hours(b).map(hour).join('~'),guide_sent:!!b.guide_sent,message_status:m?.status || '',exclusion:exclusion || (m?.has_active?'이미 발송됐거나 처리 중인 안내가 있습니다.':''),revision:b.revision,needs_review:!!b.needs_review,change_note:b.needs_review?'예약 변경 · 최신 내용으로 재안내가 필요합니다.':'',
        failure_reason:failed?str(m.error,300):'',failure_code:failed?str(m.provider_result,30):'',retry_allowed:failed&&!exclusion&&!m.has_active};
    });
    return json({ok:true,items,has_more:(results || []).length>100});
  }
  if(path==='guide-messages/preview' && method==='POST') {
    const d=await readJson(request),codes=[...new Set(Array.isArray(d.codes)?d.codes:[])];
    if(!codes.length || codes.length>20 || codes.some(x=>typeof x!=='string' || !/^[A-Z0-9-]{1,40}$/.test(x))) return err('예약을 1~20건 선택해 주세요.');
    const include=d.include_manual===true,reason=str(d.reason,300); if(include && !reason) return err('기존 안내 고객에게 다시 안내할 사유를 입력해 주세요.');
    const items=[],excluded=[];
    for(const code of codes){const b=await booking(env,code),why=guideEligibility(b,s,Date.now(),include),previous=await active(env,b); if(why || previous){excluded.push({booking_code:code,reason:why || '이미 발송됐거나 처리 중인 안내가 있습니다.'});continue;} try{items.push({...await messageSnapshot(env,b,s,true),needs_review:!!b.needs_review});}catch(e){excluded.push({booking_code:code,reason:e.message});}}
    const id=crypto.randomUUID(),expires=Date.now()+10*60000;
    await env.DB.prepare('DELETE FROM booking_guide_previews WHERE expires_at<?').bind(Date.now()).run();
    await env.DB.prepare('INSERT INTO booking_guide_previews(id,payload,expires_at) VALUES(?,?,?)').bind(id,JSON.stringify({items,config_hash:hash,include_manual:include,reason}),expires).run();
    return json({ok:true,preview_id:id,items:await Promise.all(items.map(x=>presentSnapshot(env,x,s))),excluded,expires_at:expires,blocked:await ready(env,s)});
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
      const {needs_review,...immutable}=snap;
      let fresh;try{if(!why)fresh=await messageSnapshot(env,b,s);}catch{items.push({booking_code:snap.booking_code,skipped:true,reason:'통합 안내 링크가 변경되었습니다. 다시 미리보기해 주세요.'});continue;}
      if(why || !sameSnapshot(immutable,fresh) || await active(env,b)){items.push({booking_code:snap.booking_code,skipped:true,reason:why || '예약 내용 또는 발송 이력이 바뀌었습니다.'});continue;}
      try{const id=await insertMessage(env,b,s,'live','admin',payload.reason,null,immutable);await dispatch(env,id,s,template);const row=await env.DB.prepare('SELECT status,error FROM booking_guide_messages WHERE id=?').bind(id).first();items.push({booking_code:b.booking_code,id,...row});halted=['unknown','sending','queued'].includes(row.status);}catch{items.push({booking_code:b.booking_code,skipped:true,reason:'처리 중이거나 저장할 수 없습니다. 이력을 확인해 주세요.'});halted=true;}
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
