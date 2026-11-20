import { bookingHourSql } from './_booking_availability.js';
import { err, isDate, json, kstToday, log, now, readJson, sha256, SPACES } from './_lib.js';

const products = {
  'megaspot-gundae': { space: 81999, items: [[140188, '메가스팟 시간단위']] },
  'megaspot-gundae-2': { space: 67179, items: [
    [110429, '건대2호점 시간단위 대관'],
    [110782, '건대2호점 낮올나잇 대관'],
    [110785, '건대2호점 올데이 전체대관'],
  ] },
};
const prefix = 'spacecloud_block:';
const addDay = (date, offset) => new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
const endsAt = (date, hour) => Date.parse(date + 'T00:00:00+09:00') + hour * 3600000;
const clock = hour => String(hour).padStart(2, '0') + ':00';
const channel = "COALESCE(CASE WHEN json_valid(i.data) THEN json_extract(i.data,'$.channel') END,'')";

export function spacecloudSegments(date, start, end) {
  if (!isDate(date) || !Number.isInteger(start) || !Number.isInteger(end) ||
      start < 0 || end > 48 || start >= end) return [];
  const segments = [];
  for (let day = Math.floor(start / 24); day * 24 < end; day++) {
    const offset = day * 24;
    segments.push({date: addDay(date, day), start: Math.max(0, start - offset), end: Math.min(24, end - offset)});
  }
  return segments;
}

async function productBlock(booking, segment, product, productName) {
  const productSpace = products[booking.space_id].space;
  const id = [booking.booking_code, product, segment.date, segment.start, segment.end].join(':');
  const marker = 'MSWEB-' + (await sha256(id)).slice(0, 16).toUpperCase();
  return { id, code: booking.booking_code, space_id: booking.space_id, space_name: SPACES[booking.space_id],
    product, product_name: productName, ...segment, marker,
    host_url: `https://partner.spacecloud.kr/reservation-calendar?product=${product}&space=${productSpace}`,
    public_url: `https://www.spacecloud.kr/space/${productSpace}` };
}

async function listing(env, instant) {
  const upcoming = await env.DB.prepare(`SELECT b.booking_code,b.space_id,b.status,b.date,
    ${bookingHourSql('b','i','start_h')} AS start_h,${bookingHourSql('b','i','end_h')} AS end_h,
    ${channel} AS channel
    FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref
    WHERE b.space_id IN ('megaspot-gundae','megaspot-gundae-2')
      AND b.date >= ? AND b.status IN ('confirmed','completed','payment_review')
    ORDER BY b.date,b.start_h,b.booking_code`).bind(kstToday(-2)).all();
  const tracked = await env.DB.prepare(`SELECT key,value,updated_at FROM settings
    WHERE key GLOB 'spacecloud_block:*' AND json_valid(value) AND json_extract(value,'$.state')='blocked'`).all();
  const blocked = new Map();
  for (const record of tracked.results || []) {
    const entry = JSON.parse(record.value);
    if (endsAt(entry.date, entry.end) > instant) blocked.set(entry.id, {...entry, checked_at: record.updated_at});
  }
  const wanted = new Map();
  const review = [];
  const preserve = new Set();
  for (const booking of upcoming.results || []) {
    // Marketplace reservations already occupy SpaceCloud's own calendar.
    if (booking.channel === 'spacecloud') { preserve.add(booking.booking_code); continue; }
    if (booking.status !== 'confirmed') { preserve.add(booking.booking_code); continue; }
    const segments = spacecloudSegments(booking.date, booking.start_h, booking.end_h);
    if (!segments.length) {
      preserve.add(booking.booking_code);
      if (booking.date >= kstToday()) review.push({code:booking.booking_code, date:booking.date, space_id:booking.space_id, space_name:SPACES[booking.space_id]});
      continue;
    }
    for (const segment of segments) {
      if (endsAt(segment.date, segment.end) <= instant) continue;
      for (const [product, name] of products[booking.space_id].items) {
        const entry = await productBlock(booking, segment, product, name);
        wanted.set(entry.id, entry);
      }
    }
  }
  const pending = new Set();
  const items = [];
  for (const entry of wanted.values()) {
    const previous = blocked.get(entry.id);
    if (!previous) pending.add(entry.code);
    items.push({...entry, action:previous?'linked':'block', checked_at:previous?.checked_at});
  }
  for (const entry of blocked.values()) {
    if (wanted.has(entry.id)) continue;
    // Keep the original slot until the replacement has been checked.
    items.push({...entry, action:pending.has(entry.code)||preserve.has(entry.code)?'hold':'release'});
  }
  items.sort((a,b) => a.date.localeCompare(b.date) || a.start-b.start || a.product-b.product);
  return {items, review};
}

export async function spacecloudBlocksAdmin({env, request, method}) {
  if (method === 'GET') return json({ok:true,...await listing(env, Date.now())});
  if (method !== 'POST') return err('지원하지 않는 방식입니다.',405);
  const {id, action} = await readJson(request,2048);
  if (typeof id !== 'string' || id.length > 100 || !['block','release'].includes(action)) return err('확인할 일정과 상태를 선택해 주세요.');
  const {items} = await listing(env,Date.now());
  const entry = items.find(row => row.id === id);
  if (entry?.action === 'linked' && action === 'block') return json({ok:true});
  if (!entry || entry.action !== action) return err('예약 일정 또는 확인 상태가 바뀌었습니다. 목록을 다시 확인해 주세요.',409,'SLOT_CHANGED');
  const state = action === 'block' ? 'blocked' : 'released';
  const {action: previousAction, checked_at, ...snapshot} = entry;
  const result = await env.DB.prepare(`INSERT INTO settings(key,value,updated_at) VALUES(?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    WHERE json_extract(settings.value,'$.state')<>json_extract(excluded.value,'$.state')`)
    .bind(prefix+id,JSON.stringify({...snapshot,state}),now()).run();
  if (result.meta?.changes ?? result.changes) {
    await log(env,'spacecloud.'+state,entry.code,'admin',{product:entry.product,date:entry.date,start:clock(entry.start),end:clock(entry.end)});
  }
  return json({ok:true});
}
