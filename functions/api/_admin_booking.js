import {saveBookingPhone2} from './_contacts.js';
import { err, json, now, isDate } from './_lib.js';
import { bookingAvailableSql } from './_booking_availability.js';

export async function batch(env, statements) {
  if (!statements.length) return;
  if (typeof env.DB.batch === 'function') return env.DB.batch(statements);
  for (const statement of statements) await statement.run();
}

// Compare adjacent dates too: an overnight booking can extend to the next afternoon.
export async function bookingClashes(env, space, date, start, end, exclude = []) {
  const { results } = await env.DB.prepare("SELECT booking_code, customer_name, date, start_h, end_h FROM bookings WHERE space_id = ? AND date BETWEEN date(?, '-1 day') AND date(?, '+1 day') AND status = 'confirmed'").bind(space, date, date).all();
  return (results || []).filter(b => {
    if (exclude.includes(b.booking_code)) return false;
    if (start == null || end == null || b.start_h == null || b.end_h == null) return b.date === date;
    const shift = (Date.parse(b.date + 'T00:00:00Z') - Date.parse(date + 'T00:00:00Z')) / 36e5;
    return start < b.end_h + shift && b.start_h + shift < end;
  });
}
export function conflictResponse(bookings) {
  return json({ ok: false, code: 'DATE_HAS_BOOKING', error: '이용 시간이 겹치는 확정 예약이 있습니다. 일정을 확인해 주세요.', bookings }, 409);
}

// Return statements so the inquiry, booking and calendar are committed together.
export async function linkedBookingChanges(env, ref, next) {
  const { results } = await env.DB.prepare("SELECT * FROM bookings WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(ref).all();
  const bookings = results || [], statements = [env.DB.prepare("UPDATE catering_orders SET customer = ?, phone = ?, event_date = ?, space_id = ?, updated_at = ? WHERE inquiry_ref = ? AND status <> 'cancelled'").bind(next.name, next.phone, next.date || null, next.space_id, now(), ref)];
  if (!bookings.length) return { statements, invalidated: false };
  if (!isDate(next.date)) return { error: err('확정 예약의 이용일은 비울 수 없습니다.') };
  if (String(next.phone || '').replace(/\D/g, '').length < 9) return { error: err('확정 예약의 연락처를 확인해 주세요.') };
  if (bookings.some(b => b.space_id !== next.space_id)) return { error: err('확정 예약의 공간은 취소 후 다시 확정해 주세요.', 409, 'HAS_BOOKING') };
  const scheduleChanged = bookings.some(b => b.date !== next.date || b.start_h !== next.start_h || b.end_h !== next.end_h);
  if (scheduleChanged) {
    const clashes = await bookingClashes(env, next.space_id, next.date, next.start_h, next.end_h, bookings.map(b => b.booking_code));
    if (clashes.length) return { error: conflictResponse(clashes) };
  }
  let invalidated = false;
  for (const b of bookings) {
    if(next.phone2!==undefined)statements.push(saveBookingPhone2(env,b.booking_code,next.phone2));
    const changed = !!next.document_changed || b.customer_name !== next.name || b.phone !== next.phone || b.date !== next.date || b.start_h !== next.start_h || b.end_h !== next.end_h || b.headcount !== next.headcount || ('amount' in next && b.amount !== next.amount);
    invalidated = invalidated || !!(changed && b.confirm_doc);
    statements.push(env.DB.prepare('UPDATE bookings SET customer_name = ?, phone = ?, phone_last4 = ?, date = ?, start_h = ?, end_h = ?, slot = ?, headcount = ?, amount = ?, memo = ?, confirm_doc = ?, updated_at = ? WHERE booking_code = ?')
      .bind(next.name, next.phone, next.phone.replace(/\D/g, '').slice(-4), next.date, next.start_h, next.end_h, next.start_h == null ? '' : 'custom', next.headcount, 'amount' in next ? next.amount : b.amount, next.memo ?? b.memo, changed ? null : b.confirm_doc, now(), b.booking_code));
    if (b.date !== next.date) {
      const block = await env.DB.prepare('SELECT state FROM calendar_blocks WHERE space_id = ? AND date = ? AND memo = ?').bind(b.space_id, b.date, '예약 ' + b.booking_code).first();
      if (block) {
        const existing = await env.DB.prepare('SELECT memo FROM calendar_blocks WHERE space_id = ? AND date = ?').bind(b.space_id, next.date).first();
        if (existing) return { error: err('이동할 날짜에 마감·임시 확보 표시가 있습니다. 일정 달력에서 먼저 확인해 주세요.', 409, 'DATE_BLOCKED') };
        statements.push(env.DB.prepare('UPDATE calendar_blocks SET date = ? WHERE space_id = ? AND date = ? AND memo = ?').bind(next.date, b.space_id, b.date, '예약 ' + b.booking_code));
      }
    }
  }
  return { statements, invalidated };
}

export async function bookingStatusStatements(env, code, status) {
  const b = await env.DB.prepare('SELECT booking_code, inquiry_ref, status, start_h, end_h FROM bookings WHERE booking_code = ?').bind(code).first();
  if (!b) return { error: err('예약을 찾을 수 없습니다.', 404, 'NOT_FOUND') };
  const review=b.status==='payment_review'&&status==='confirmed';
  if(review&&(!Number.isFinite(b.start_h)||!Number.isFinite(b.end_h)||b.start_h<0||b.end_h>47||b.end_h<=b.start_h))return {error:err('이용 시작·종료 시간을 확인해 주세요.',409,'BOOKING_REVIEW')};
  const available=bookingAvailableSql({space:'bookings.space_id',date:'bookings.date',start:'bookings.start_h',end:'bookings.end_h',exclude:'bookings.booking_code'});
  const gate=`status='payment_review' AND start_h IS NOT NULL AND end_h IS NOT NULL AND start_h>=0 AND end_h>start_h AND end_h<=47 AND (${available})`;
  const statements=[];
  if(review)statements.push(env.DB.prepare(`UPDATE booking_guide_state SET needs_review=0 WHERE booking_code=? AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=? AND ${gate})`).bind(code,code));
  statements.push(env.DB.prepare('UPDATE bookings SET status = ?, updated_at = ?'+(review?",memo=replace(COALESCE(memo,''),' · ※ 결제 완료 · 일정 확인 필요 · 예약 확정 보류','')":'')+' WHERE booking_code = ?'+(review?` AND ${gate}`:'' )).bind(status, now(), code));
  if(review)statements.push(env.DB.prepare("UPDATE orders SET result_msg='승인 완료 · 일정 검토 후 예약 확정',updated_at=? WHERE booking_code=? AND status='paid' AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=? AND status='confirmed')").bind(now(),code,code));
  if(status!=='cancelled'&&b.status==='cancelled')statements.push(env.DB.prepare('DELETE FROM booking_cancellation_state WHERE booking_code=?').bind(code));
  if (status === 'cancelled') statements.push(env.DB.prepare('DELETE FROM calendar_blocks WHERE memo = ?').bind('예약 ' + code));
  if (b.inquiry_ref) {
    const inquiryStatus = { confirmed: '예약 확정', completed: '이용 완료', cancelled: '취소·환불' }[status];
    statements.push(env.DB.prepare('UPDATE inquiries SET status = ?, updated_at = ? WHERE ref = ?'+(review?' AND EXISTS(SELECT 1 FROM bookings WHERE booking_code=? AND status=?)':'')).bind(inquiryStatus, now(), b.inquiry_ref,...(review?[code,status]:[])));
  }
  return { statements, ref: b.inquiry_ref, previous: b.status };
}
