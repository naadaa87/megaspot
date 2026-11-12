import {err,json,now,readJson,log} from './_lib.js';
export const dayAt=at=>new Date(at+9*3600000).toISOString().slice(0,10);
export const shiftDay=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function defaultBalanceDue(b){
 const created=String(b.confirmed_at||b.created_at||'').slice(0,10);
 const nominal=shiftDay(b.date,-3);
 return /^\d{4}-\d{2}-\d{2}$/.test(created)&&created>nominal?created:nominal;
}
export async function paymentSchedule(env,b){
 const row=await env.DB.prepare('SELECT * FROM booking_payment_schedule WHERE booking_code=?').bind(b.booking_code).first();
 const state=await env.DB.prepare('SELECT confirmed_at FROM booking_journey_state WHERE booking_code=?').bind(b.booking_code).first();
 return {due_date:row?.due_date||defaultBalanceDue({...b,confirmed_at:state?.confirmed_at||b.confirmed_at}),custom:!!row?.due_date,version:row?.version||0};
}
export async function paymentScheduleAdmin({env,request,path,method}){
 const code=path.split('/')[1],b=await env.DB.prepare('SELECT * FROM bookings WHERE booking_code=?').bind(code).first();
 if(!b)return err('예약을 찾을 수 없습니다.',404);
 if(method==='GET')return json({ok:true,...await paymentSchedule(env,b)});
 if(method!=='PUT')return err('지원하지 않는 요청입니다.',405);
 if(b.status!=='confirmed')return err('확정 예약에서 잔금 기한을 설정해 주세요.',409);
 const d=await readJson(request,2048),due=d.due_date||null;
 if(due!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T00:00:00Z'))||shiftDay(due,0)!==due||due>b.date))return err('이용일까지의 올바른 잔금 납부일을 입력해 주세요.');
 if(!Number.isSafeInteger(d.version)||d.version<0)return err('최신 기한 정보를 확인해 주세요.',409);
 const r=await env.DB.prepare(`INSERT INTO booking_payment_schedule(booking_code,due_date,version,updated_at) SELECT ?,?,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM booking_payment_schedule WHERE booking_code=?)
 ON CONFLICT(booking_code) DO UPDATE SET due_date=excluded.due_date,version=booking_payment_schedule.version+1,updated_at=excluded.updated_at WHERE booking_payment_schedule.version=?`).bind(code,due,now(),d.version,code,d.version).run();
 if(!Number(r.meta?.changes??r.changes))return err('다른 관리자가 기한을 변경했습니다. 새로고침해 주세요.',409);
 await log(env,'booking.balance_due',code,'admin',{due_date:due});
 return json({ok:true,...await paymentSchedule(env,b)});
}
