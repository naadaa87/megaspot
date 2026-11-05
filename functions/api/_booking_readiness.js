import {json,err,isDate,kstToday,str,SPACES} from './_lib.js';
import {parseDoc} from './_confirm.js';
import {GUIDE_VERSION,guideEligibility} from './_guide_messages.js';
import {portalPreparationState} from './_booking_portal.js';
import {settlementsFor} from './_settlement.js';
import {cateringOrderFor} from './_catering_orders.js';
import {confirmationFoodData,foodDocuments} from './_food_services.js';
import {receptionDocument} from './_reception.js';

const parse=raw=>{try{return JSON.parse(raw||'{}')||{};}catch{return {};}};
const stage=(status,label,complete=false,reason='',can_open=true)=>({status,label,complete,reason,can_open});
const purpose=b=>GUIDE_VERSION+(b.revision?':r'+b.revision:'');
const inFlight=new Set(['sending','accepted','unknown']);
const guideLabels={queued:'발송 대기',sending:'발송 처리 중',accepted:'접수 · 수신 결과 대기',unknown:'결과 확인 필요',failed:'발송 실패',cancelled:'발송 취소'};

function guideState(b,messages,automaticPending,settings){
 const current=messages.filter(m=>m.purpose===purpose(b)),last=current.at(-1);
 const delivered=current.some(m=>m.status==='delivered');
 const manual=!!b.manual_sent&&b.manual_sent!=='0'&&b.manual_sent!=='false'&&b.manual_revision===b.revision;
 const unresolved=messages.find(m=>m.purpose!==purpose(b)&&inFlight.has(m.status));
 if(!['confirmed','completed'].includes(b.status))return stage('blocked','안내 보류',false,b.status==='payment_review'?'일정 검토 후 예약을 확정해 주세요.':'취소된 예약입니다.',true);
 if(unresolved)return stage('unknown','이전 안내 결과 확인 필요',false,'변경 전 안내가 처리 중이거나 결과 불명입니다. 중복 발송 전에 이력을 확인해 주세요.');
 if(delivered)return stage('delivered','수신 성공',true);
 if(manual)return stage('manual','수동 안내 확인',true,'현재 예약 내용에 대한 수동 안내 체크입니다.');
 if(b.needs_review)return stage('changed','변경 후 재안내 필요',false,'예약 내용이 변경됐습니다. 최신 내용으로 확인해 주세요.');
 const eligibility=guideEligibility({...b,guide_sent:false},settings);
 if(last)return stage(last.status,guideLabels[last.status]||'확인 필요',false,last.status==='failed'?str(last.error,300):eligibility);
 if(automaticPending)return stage('queued','자동 안내 처리 대기',false,eligibility);
 return stage('missing','미안내',false,eligibility||(!settings.enabled?'고객 발송 설정이 꺼져 있습니다.':''));
}

async function confirmationState(env,b,settlement){
 if(!['confirmed','completed'].includes(b.status))return stage('blocked','발급 보류',false,b.status==='payment_review'?'일정 검토 후 예약을 확정해 주세요.':'취소된 예약입니다.',false);
 const doc=parseDoc(b.confirm_doc);
 if(!doc?.issued_at)return stage(b.was_issued?'outdated':'missing',b.was_issued?'재발급 필요':'미발급',false,b.was_issued?'예약 변경으로 기존 확정서가 무효화됐습니다.':'아직 예약확정서를 발급하지 않았습니다.');
 if(!settlement||!Object.hasOwn(doc,'settlement')||doc.settlement?.revision!==settlement.revision)return stage('outdated','재발급 필요',false,'현재 예약·수납 내역으로 확정서를 다시 발급해 주세요.');
 // Use the same legacy-document checks as the existing confirmation editor.
 if(!Object.hasOwn(doc,'reception')||!Object.hasOwn(doc,'food_services')){
  const order=await cateringOrderFor(env,b.inquiry_ref||'',b.booking_code),data=await confirmationFoodData(env,b,order);
  const foods=foodDocuments({...data,catering:data.catering||order||null},settlement.amount);
  if((receptionDocument(data,settlement.amount)&&!Object.hasOwn(doc,'reception'))||(foods.length&&!Object.hasOwn(doc,'food_services')))return stage('outdated','재발급 필요',false,'현재 식음료 구성을 포함해 확정서를 다시 발급해 주세요.');
 }
 return {...stage('issued','발급 완료',true),issued_at:doc.issued_at,updated_at:doc.updated_at||doc.issued_at};
}

export async function bookingReadiness({env,url,method}){
 if(method!=='GET')return err('조회 전용 목록입니다.',405,'METHOD');
 const from=url.searchParams.get('from')||kstToday(-1),to=url.searchParams.get('to')||kstToday(365);
 if(!isDate(from)||!isDate(to)||from>to||Date.parse(to)-Date.parse(from)>366*86400000)return err('조회 기간을 확인해 주세요. 한 번에 최대 1년 범위로 조회할 수 있습니다.',400,'INVALID_RANGE');
 const space=url.searchParams.get('space')||'',scope=url.searchParams.get('scope')||'active',filter=url.searchParams.get('filter')||'attention';
 if(space&&!Object.hasOwn(SPACES,space))return err('공간을 확인해 주세요.',400,'INVALID_SPACE');
 if(!['active','all','confirmed','completed','payment_review','cancelled'].includes(scope)||!['all','attention','guide','confirmation','portal','ready','blocked'].includes(filter))return err('목록 조건을 확인해 주세요.',400,'INVALID_FILTER');
 const rawPage=url.searchParams.get('page')||'0';if(!/^(0|[1-9]\d{0,4})$/.test(rawPage))return err('페이지를 확인해 주세요.',400,'INVALID_PAGE');
 const page=Number(rawPage),pageSize=50,q=str(url.searchParams.get('q'),60).toLowerCase(),phoneQuery=/^[+\d\s()-]+$/.test(q)?q.replace(/\D/g,''):'',conditions=['b.date BETWEEN ? AND ?'],args=[from,to];
 if(space){conditions.push('b.space_id=?');args.push(space);}
 if(scope==='active')conditions.push("b.status IN ('confirmed','payment_review')");else if(scope!=='all'){conditions.push('b.status=?');args.push(scope);}
 const {results}=await env.DB.prepare(`SELECT b.*,i.data AS idata,COALESCE(gs.revision,0) AS revision,gs.manual_sent,gs.manual_revision,COALESCE(gs.needs_review,0) AS needs_review,
   p.token_hash AS portal_hash,p.link_cipher AS portal_cipher,p.recipient_hash AS portal_recipient,p.expires_at AS portal_expiry,p.version AS portal_version,
   EXISTS(SELECT 1 FROM event_log e WHERE e.ref=b.booking_code AND e.kind IN ('booking.confirm_doc.issued','booking.confirm_doc.updated')) AS was_issued
   FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref LEFT JOIN booking_guide_state gs ON gs.booking_code=b.booking_code LEFT JOIN booking_portal_links p ON p.booking_code=b.booking_code
   WHERE ${conditions.join(' AND ')} ORDER BY b.date,COALESCE(b.start_h,99),b.id LIMIT 5001`).bind(...args).all();
 const rows=(results||[]).filter(b=>!q||[b.booking_code,b.customer_name,b.phone,b.inquiry_ref].some(v=>String(v||'').toLowerCase().includes(q))||phoneQuery&&String(b.phone||'').replace(/\D/g,'').includes(phoneQuery));
 if((results||[]).length>5000)return err('조회 예약이 많습니다. 날짜 범위를 좁혀 주세요.',400,'RANGE_TOO_LARGE');
 const guideSettings=parse((await env.DB.prepare("SELECT value FROM settings WHERE key='reservation_guide'").first())?.value),settings={enabled:guideSettings.enabled===true,spaces:Array.isArray(guideSettings.spaces)?guideSettings.spaces:[]};
 const messages={},events=new Set();
 for(let i=0;i<rows.length;i+=80){
  const codes=rows.slice(i,i+80).map(b=>b.booking_code),marks=codes.map(()=>'?').join(',');
  const {results:history}=await env.DB.prepare(`SELECT m.booking_code,m.purpose,m.status,m.error,m.created_at FROM booking_guide_messages m LEFT JOIN booking_guide_state gs ON gs.booking_code=m.booking_code
    WHERE m.mode='live' AND m.booking_code IN (${marks}) AND (m.purpose='reservation-guide-v1'||CASE WHEN COALESCE(gs.revision,0)=0 THEN '' ELSE ':r'||gs.revision END OR ((m.purpose='reservation-guide-v1' OR m.purpose GLOB 'reservation-guide-v1:r[0-9]*') AND m.status IN ('sending','accepted','unknown'))) ORDER BY m.created_at,m.rowid`).bind(...codes).all();
  for(const m of history||[])(messages[m.booking_code]||=[]).push(m);
  const {results:pending}=await env.DB.prepare(`SELECT e.booking_code FROM booking_guide_events e JOIN booking_guide_state gs ON gs.booking_code=e.booking_code AND gs.revision=e.revision WHERE e.status='pending' AND e.booking_code IN (${marks})`).bind(...codes).all();
  for(const e of pending||[])events.add(e.booking_code);
 }
 const issued=rows.filter(b=>parseDoc(b.confirm_doc)?.issued_at),settlements=await settlementsFor(env,issued.map(b=>b.booking_code)),items=[];
 for(const b of rows){
  const link=b.portal_hash?{token_hash:b.portal_hash,link_cipher:b.portal_cipher,recipient_hash:b.portal_recipient,expires_at:b.portal_expiry,version:b.portal_version}:null;
  const guide=guideState(b,messages[b.booking_code]||[],events.has(b.booking_code),settings),confirmation=await confirmationState(env,b,settlements[b.booking_code]),portal=await portalPreparationState(env,b,link);
  const blocked=!['confirmed','completed'].includes(b.status),ready=!blocked&&guide.complete&&confirmation.complete&&portal.complete;
  items.push({booking_code:b.booking_code,inquiry_ref:b.inquiry_ref||'',name:b.customer_name,phone:b.phone,space_id:b.space_id,date:b.date,start_h:b.start_h,end_h:b.end_h,slot:b.slot,status:b.status,revision:b.revision,guide,confirmation,portal,blocked,ready,needs_attention:b.status!=='cancelled'&&!ready});
 }
 const summary={total:items.length,attention:items.filter(x=>x.needs_attention).length,guide:items.filter(x=>!x.blocked&&!x.guide.complete).length,confirmation:items.filter(x=>!x.blocked&&!x.confirmation.complete).length,portal:items.filter(x=>!x.blocked&&!x.portal.complete).length,ready:items.filter(x=>x.ready).length,blocked:items.filter(x=>x.blocked).length};
 const filtered=items.filter(x=>filter==='all'||filter==='attention'&&x.needs_attention||filter==='ready'&&x.ready||filter==='blocked'&&x.blocked||['guide','confirmation','portal'].includes(filter)&&!x.blocked&&!x[filter].complete);
 return json({ok:true,read_only:true,from,to,scope,filter,page,page_size:pageSize,total:filtered.length,has_more:(page+1)*pageSize<filtered.length,summary,items:filtered.slice(page*pageSize,(page+1)*pageSize)});
}
