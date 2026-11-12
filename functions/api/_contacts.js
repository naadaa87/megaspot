// The primary phone keeps its existing identity/last-four semantics. Extra contacts are admin-only.
import {err,json,readJson,str,now,log} from './_lib.js';
export function mobilePhone(value){let p=String(value||'').replace(/\D/g,'');if(p.startsWith('82'))p='0'+p.slice(2);return /^01[016789]\d{7,8}$/.test(p)?p:'';}
export function contactPhones(b){return [...new Set([mobilePhone(b?.phone),mobilePhone(b?.phone2)].filter(Boolean))];}
export function cleanPhone2(value,primary=''){
 const raw=String(value??'').trim();if(!raw)return '';
 const phone=mobilePhone(raw);if(!phone)throw Error('연락처 2에 알림톡 수신 가능한 휴대폰 번호를 입력해 주세요.');
 return phone===mobilePhone(primary)?'':phone;
}
export function bookingPhone2Sql(alias='b'){
 return `COALESCE((SELECT c.phone2 FROM booking_contacts c WHERE c.booking_code=${alias}.booking_code),(SELECT json_extract(i.data,'$.phone2') FROM inquiries i WHERE i.ref=${alias}.inquiry_ref),'')`;
}
export async function bookingContacts(env,code){return env.DB.prepare(`SELECT b.*,${bookingPhone2Sql()} AS phone2 FROM bookings b WHERE b.booking_code=?`).bind(code).first();}
export function saveBookingPhone2(env,code,phone2){return env.DB.prepare(`INSERT INTO booking_contacts(booking_code,phone2,updated_at) SELECT booking_code,?,? FROM bookings WHERE booking_code=? ON CONFLICT(booking_code) DO UPDATE SET phone2=excluded.phone2,updated_at=excluded.updated_at`).bind(phone2,now(),code);}
export async function contactsAdmin({env,request,path,method}){
 const match=path.match(/^bookings\/([A-Z0-9-]+)\/contacts$/);if(!match)return null;
 const b=await bookingContacts(env,match[1]);if(!b)return err('예약을 찾을 수 없습니다.',404);
 if(method==='GET')return json({ok:true,code:b.booking_code,name:b.customer_name,phone:b.phone,phone2:b.phone2,recipients:contactPhones(b)});
 if(method!=='PUT')return err('지원하지 않는 요청입니다.',405);
 const d=await readJson(request),incoming=str(d.phone,30).replace(/[^0-9-+]/g,''),phone=mobilePhone(incoming)&&mobilePhone(incoming)===mobilePhone(b.phone)?b.phone:incoming;if(phone.replace(/\D/g,'').length<9)return err('연락처 1을 확인해 주세요.');
 let phone2;try{phone2=cleanPhone2(d.phone2,phone);}catch(e){return err(e.message);}
 const t=now(),stmts=[saveBookingPhone2(env,b.booking_code,phone2),env.DB.prepare('UPDATE bookings SET confirm_doc=CASE WHEN phone<>? THEN NULL ELSE confirm_doc END,phone=?,phone_last4=?,updated_at=? WHERE booking_code=?').bind(phone,phone,phone.replace(/\D/g,'').slice(-4),t,b.booking_code)];
 // Keep a linked inquiry and its other active bookings in sync, without altering customer documents or prices.
 if(b.inquiry_ref){
  stmts.push(env.DB.prepare("UPDATE inquiries SET phone=?,data=json_set(data,'$.phone',?,'$.phone2',?),updated_at=? WHERE ref=?").bind(phone,phone,phone2,t,b.inquiry_ref));
  stmts.push(env.DB.prepare("INSERT INTO booking_contacts(booking_code,phone2,updated_at) SELECT booking_code,?,? FROM bookings WHERE inquiry_ref=? AND status<>'cancelled' ON CONFLICT(booking_code) DO UPDATE SET phone2=excluded.phone2,updated_at=excluded.updated_at").bind(phone2,t,b.inquiry_ref));
  stmts.push(env.DB.prepare("UPDATE bookings SET phone=?,phone_last4=?,updated_at=? WHERE inquiry_ref=? AND status<>'cancelled' AND booking_code<>?").bind(phone,phone.replace(/\D/g,'').slice(-4),t,b.inquiry_ref,b.booking_code));
 }
 await env.DB.batch(stmts);await log(env,'booking.contacts_updated',b.booking_code,'admin',{secondary:!!phone2});
 return json({ok:true,phone,phone2,recipients:contactPhones({phone,phone2})});
}
