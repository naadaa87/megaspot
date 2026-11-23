import {err,isDate,json,log,now,readJson,str,uniqueRef} from './_lib.js';
import {timeOk} from './_visits.js';

export const FOOD_SPACE = 'food-only';
export const confirmIssuedSql = (column = 'confirm_doc') => `CASE WHEN COALESCE(json_extract(${column}, '$.food_needs_reissue'), 0) = 0 THEN json_extract(${column}, '$.issued_at') END`;
const OPEN = ['문의 접수','조건 확인','견적 발송','결제 대기'];
const KINDS = ['catering','reception','cocktail'];
const refOk = value => /^[A-Z0-9-]{4,20}$/.test(value);
const changes = result => Number(result?.meta?.changes ?? result?.changes ?? 0);

export const foodEventSql = (alias = 'b') => `CASE WHEN ${alias}.space_id='${FOOD_SPACE}' THEN
  (SELECT json_extract(data,'$.food_event') FROM inquiries WHERE ref=${alias}.inquiry_ref) END`;

export function foodEvent(value) {
  if (!value) return null;
  try { return typeof value === 'string' ? JSON.parse(value) : value; } catch { return null; }
}

export function foodDocumentEvent(value, showAmount = true) {
  const event = foodEvent(value) || {};
  return {
    location: event.location || '',
    start: event.start || '',
    end: event.end || '',
    ...(showAmount ? {reservation_fee: event.reservation_fee ?? null, balance_due: event.balance_due || ''} : {})
  };
}

export async function foodInquiry(env, ref) {
  return env.DB.prepare('SELECT * FROM inquiries WHERE ref=? AND space_id=?').bind(ref, FOOD_SPACE).first();
}

function validateFields(d, defaults, confirm, total, existingFee) {
  const name = str(d.name ?? defaults.name, 80);
  const phone = str(d.phone ?? defaults.phone, 30).replace(/[^\d+-]/g, '');
  const email = str(d.email ?? defaults.email, 120);
  const date = d.date ?? defaults.date ?? '';
  const location = str(d.location ?? defaults.location, 200);
  const start = d.start ?? defaults.start ?? '', end = d.end ?? defaults.end ?? '';
  const headcount = d.headcount ?? defaults.headcount ?? '';
  const people = headcount === '' ? null : Number(headcount);
  const fee = d.reservation_fee ?? defaults.reservation_fee ?? '';
  const reservation_fee = fee === '' ? null : Number(fee);
  const balance_due = d.balance_due ?? defaults.balance_due ?? '';
  if (!name) return {error:'고객 이름을 입력해 주세요.'};
  if ((phone || confirm) && phone.replace(/\D/g, '').length < 9) return {error:'고객 연락처를 확인해 주세요.'};
  if ((date || confirm) && !isDate(date)) return {error:'행사일을 확인해 주세요.'};
  if (timeOk(start) !== start || timeOk(end) !== end) return {error:'행사 시작·종료 시간을 확인해 주세요.'};
  if (people !== null && (!Number.isInteger(people) || people < 1 || people > 999)) return {error:'행사 인원을 확인해 주세요.'};
  if (reservation_fee !== null && (!Number.isSafeInteger(reservation_fee) || reservation_fee < 0 || reservation_fee > 1e9 || (reservation_fee > (total ?? 1e9) && reservation_fee !== existingFee))) return {error:'예약금 약정액을 확인해 주세요.'};
  if (balance_due && (!isDate(balance_due) || (date && balance_due > date))) return {error:'잔금 납부일은 행사일까지로 입력해 주세요.'};
  return {name, phone, email, date, headcount:people, event:{location,start,end,reservation_fee,balance_due}};
}

function applySelections(data, snapshot, confirmed) {
  for (const kind of KINDS) {
    const service = snapshot?.extras.find(row => row.kind === kind);
    if (service) data[kind] = {...service[kind], status:confirmed ? 'confirmed' : 'pending'};
    else if (snapshot) delete data[kind];
    if (snapshot || service) {
      data['included_'+kind+'_amount'] = service?.amount || 0;
      data[kind+'_in_quote'] = !!service;
    }
  }
}

async function selectedQuote(env, raw) {
  const quote_no = str(raw, 20).toUpperCase();
  if (!refOk(quote_no)) return null;
  const row = await env.DB.prepare(`SELECT q.quote_no,q.total,q.data,l.inquiry_ref
    FROM quotes q LEFT JOIN food_quote_links l ON l.quote_no=q.quote_no WHERE q.quote_no=?`).bind(quote_no).first();
  const data = foodEvent(row?.data);
  if (!data?.input?.foodOnly || !Array.isArray(data.extras) || !data.extras.length
    || !Number.isSafeInteger(row.total) || row.total <= 0
    || data.extras.some(x => !KINDS.includes(x.kind) || !x[x.kind] || !Number.isSafeInteger(x.amount) || x.amount <= 0)
    || data.extras.reduce((sum, x) => sum + x.amount, 0) !== row.total) return null;
  return {...row, ...data, quote_no, total:row.total, inquiry_ref:row.inquiry_ref};
}

export async function foodBookingAdmin({env,request,path,method}) {
  const ref = path.split('/')[1] || '';
  if ((!ref && method !== 'POST') || (ref && (method !== 'PUT' || !refOk(ref)))) return err('지원하지 않는 작업입니다.',405);
  const d = await readJson(request,8192);
  const quote = d.quote_no ? await selectedQuote(env,d.quote_no) : null;
  if (d.quote_no && !quote) return err('저장된 식음료 단독 견적을 선택해 주세요.');
  if (ref && quote?.inquiry_ref && quote.inquiry_ref !== ref) return err('다른 문의에 연결된 견적입니다.',409,'FOOD_QUOTE_LINKED');

  const registration_key = quote && !ref ? 'quote:'+quote.quote_no : str(d.request_id,80);
  if (!ref && !quote && !/^[A-Za-z0-9_-]{8,80}$/.test(registration_key)) return err('문의 등록 요청을 다시 시작해 주세요.');
  let current = ref ? await foodInquiry(env,ref) : null;
  if (!ref) {
    const known = quote?.inquiry_ref ? await foodInquiry(env,quote.inquiry_ref) :
      await env.DB.prepare("SELECT * FROM inquiries WHERE space_id=? AND json_extract(data,'$.food_event.registration_key')=?").bind(FOOD_SPACE,registration_key).first();
    if (known) return registered(env,known.ref,true);
  }
  if (ref && !current) return err('식음료 문의를 찾을 수 없습니다.',404);
  const before = foodEvent(current?.data) || {};
  const oldEvent = before.food_event || {};
  const booked = current && await env.DB.prepare('SELECT * FROM bookings WHERE inquiry_ref=? AND space_id=? ORDER BY id DESC LIMIT 1').bind(ref,FOOD_SPACE).first();
  if (current && !OPEN.includes(current.status) && booked?.status !== 'confirmed') return err('현재 상태에서는 예약 조건을 수정할 수 없습니다.',409);
  if (current && d.version !== oldEvent.version) return err('다른 화면에서 문의가 변경되었습니다. 다시 열어 주세요.',409,'FOOD_CHANGED');
  const confirm = d.confirm === true;
  if (confirm && !booked && !quote && !oldEvent.quote_no) return err('견적을 저장하고 선택한 뒤 예약을 확정해 주세요.');
  const total = quote?.total ?? before.total ?? null;
  const input = quote?.input;
  const defaults = current ? {...oldEvent, name:current.name, phone:current.phone, email:current.email, date:current.event_date, headcount:current.headcount} :
    {name: input?.customer, phone: input?.phone, email: input?.email, date: input?.date, headcount: input?.people, location: input?.location, start:input?.foodStartTime, end:input?.foodEndTime};
  const clean = validateFields(d,defaults,confirm || !!booked,total,booked ? oldEvent.reservation_fee : null);
  if (clean.error) return err(clean.error);
  const inquiryRef = ref || await uniqueRef(env,'inquiries','ref','MS');
  const bookingCode = booked?.booking_code || (confirm ? await uniqueRef(env,'bookings','booking_code','MS') : '');
  const event = {...oldEvent,...clean.event,version:(oldEvent.version || 0)+1,quote_no:quote?.quote_no || oldEvent.quote_no || ''};
  if (!current) event.registration_key = registration_key;
  const status = bookingCode ? '예약 확정' : OPEN.includes(d.status) ? d.status : current?.status || '문의 접수';
  const memo = str(d.memo ?? current?.memo,2000);
  const data = {...before, source:'admin', inquiry_type:'food-only', space_id:FOOD_SPACE, food_event:event,
    name:clean.name,phone:clean.phone,email:clean.email,date:clean.date,headcount:clean.headcount,
    message:str(d.message ?? before.message ?? input?.note,2000),channel:before.channel || 'other',total};
  applySelections(data,quote,!!bookingCode);
  if (bookingCode && !quote) for (const kind of KINDS) if (data[kind]) data[kind] = {...data[kind],status:'confirmed'};
  const time = now(), serialized = JSON.stringify(data);
  const primary = current ? env.DB.prepare(`UPDATE inquiries SET status=?,name=?,phone=?,email=?,event_date=?,headcount=?,data=?,memo=?,updated_at=?
    WHERE ref=? AND space_id=? AND status=? AND data=? AND NOT EXISTS(SELECT 1 FROM food_quote_links WHERE quote_no=? AND inquiry_ref<>?)`)
    .bind(status,clean.name,clean.phone,clean.email,clean.date || null,clean.headcount,serialized,memo,time,inquiryRef,FOOD_SPACE,current.status,current.data,quote?.quote_no||'',inquiryRef)
    : env.DB.prepare(`INSERT OR IGNORE INTO inquiries(ref,space_id,status,name,phone,email,event_date,headcount,data,memo,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM food_quote_links WHERE quote_no=?)`)
    .bind(inquiryRef,FOOD_SPACE,status,clean.name,clean.phone,clean.email,clean.date || null,clean.headcount,serialized,memo,time,time,quote?.quote_no||'');
  const statements = [primary];
  const savedGuard = 'EXISTS(SELECT 1 FROM inquiries WHERE ref=? AND data=? AND space_id=?)';
  if (quote) statements.push(env.DB.prepare(`INSERT OR IGNORE INTO food_quote_links(quote_no,inquiry_ref)
    SELECT ?,? WHERE ${savedGuard}`).bind(quote.quote_no,inquiryRef,inquiryRef,serialized,FOOD_SPACE));
  if (bookingCode) {
    const last4 = clean.phone.replace(/\D/g,'').slice(-4);
    if (booked) {
      const documentChanged = booked.customer_name !== clean.name || booked.phone !== clean.phone || booked.date !== clean.date ||
        booked.headcount !== clean.headcount || booked.amount !== total || oldEvent.location !== event.location || oldEvent.start !== event.start ||
        oldEvent.end !== event.end || oldEvent.reservation_fee !== event.reservation_fee || oldEvent.balance_due !== event.balance_due ||
        KINDS.some(kind => JSON.stringify(before[kind] ?? null) !== JSON.stringify(data[kind] ?? null));
      statements.push(env.DB.prepare(`UPDATE bookings SET customer_name=?,phone=?,phone_last4=?,date=?,headcount=?,amount=?,memo=?,
        confirm_doc=CASE WHEN ? AND json_extract(confirm_doc,'$.issued_at') IS NOT NULL
          THEN json_set(confirm_doc,'$.food_needs_reissue',1) ELSE confirm_doc END,updated_at=? WHERE booking_code=? AND status='confirmed' AND ${savedGuard}`)
        .bind(clean.name,clean.phone,last4,clean.date,clean.headcount,total,memo,documentChanged?1:0,time,bookingCode,inquiryRef,serialized,FOOD_SPACE));
    } else {
      statements.push(env.DB.prepare(`INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,headcount,memo,status,amount,created_at,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,'confirmed',?,?,? WHERE ${savedGuard}`)
        .bind(bookingCode,FOOD_SPACE,inquiryRef,clean.name,clean.phone,last4,clean.date,clean.headcount,memo,total,time,time,inquiryRef,serialized,FOOD_SPACE));
    }
    if (!booked || oldEvent.balance_due !== event.balance_due) statements.push(env.DB.prepare(`INSERT INTO booking_payment_schedule(booking_code,due_date,version,updated_at)
      SELECT ?,?,1,? WHERE ${savedGuard} ON CONFLICT(booking_code) DO UPDATE SET due_date=excluded.due_date,version=version+1,updated_at=excluded.updated_at`)
      .bind(bookingCode,event.balance_due || null,time,inquiryRef,serialized,FOOD_SPACE));
  }
  const results = await env.DB.batch(statements);
  if (!changes(results[0])) {
    if (!ref) {
      const retry = await env.DB.prepare("SELECT ref FROM inquiries WHERE space_id=? AND json_extract(data,'$.food_event.registration_key')=?").bind(FOOD_SPACE,registration_key).first();
      if (retry) return registered(env,retry.ref,true);
    }
    return err('다른 화면에서 문의나 견적이 변경되었습니다. 다시 열어 주세요.',409,'FOOD_CHANGED');
  }
  await log(env, bookingCode && !booked ? 'food.booking.confirmed' : current ? 'food.inquiry.updated' : 'food.inquiry.created',
    inquiryRef,'admin',{booking_code:bookingCode || undefined,quote_no:event.quote_no || undefined,status});
  return json({ok:true,ref:inquiryRef,booking_code:bookingCode,status});
}

async function registered(env,ref,duplicate) {
  const b = await env.DB.prepare('SELECT booking_code FROM bookings WHERE inquiry_ref=? AND space_id=? ORDER BY id DESC LIMIT 1').bind(ref,FOOD_SPACE).first();
  return json({ok:true,ref,booking_code:b?.booking_code || '',duplicate});
}

export function foodPaymentStatus(settlement,event,previous) {
  if (!settlement || !settlement.net) return 'unpaid';
  if (settlement.balance === 0) return 'food_paid';
  if (event.reservation_fee > 0 ? settlement.net >= event.reservation_fee : previous==='reservation_paid') return 'reservation_paid';
  return 'partial_paid';
}
