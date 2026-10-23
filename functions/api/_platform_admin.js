// 관리자 API (플랫폼) — 입점·공간 등록·광고 신청, 등록 공간, 모임, 배너 광고
// functions/api/admin/[[path]].js 가 관리자 로그인을 확인한 뒤 이 함수를 부릅니다. 처리하지 않는 경로면 null 을 돌려줍니다.
import { json, err, str, num, isDate, now, uniqueRef, log, kstToday } from './_lib.js';
import { PARTNER_STATUS, PARTNER_KINDS, MEETUP_STATUS, APP_STATUS, MEETUP_VENUES, MEETUP_CATS, LISTING_STATUS, AD_SLOTS, cleanListing, cleanAd, cleanMeetup,
  publicMeetup, publicListing, meetupCounts, meetupToken, manageUrl, promoteWaitlist, safeJson, viewStatus } from './_platform.js';

const MCOLS = 'ref, status, title, category, venue, event_date, capacity, featured, verified, data, created_at, updated_at';

export async function platformCounts(env) {
  const one = async (sql, ...b) => ((await env.DB.prepare(sql).bind(...b).first()) || {}).n || 0;
  return {
    meetups_pending: await one("SELECT COUNT(*) AS n FROM meetups WHERE status = 'pending'"),
    meetups_open: await one("SELECT COUNT(*) AS n FROM meetups WHERE status = 'open' AND event_date >= ?", kstToday()),
    partners_new: await one("SELECT COUNT(*) AS n FROM host_applications WHERE status = '접수'"),
    listings_published: await one("SELECT COUNT(*) AS n FROM listings WHERE status = 'published'"),
    ads_on: await one(`SELECT COUNT(*) AS n FROM ads WHERE status = 'on' AND (end_date IS NULL OR end_date = '' OR end_date >= ?)`, kstToday())
  };
}

async function body(request) { try { return { d: JSON.parse((await request.text()) || '{}') || {} }; } catch { return { e: err('잘못된 요청 형식입니다.') }; } }

export async function platformAdmin(request, env, path, method, url) {
  const t = now();

  if (path === 'platform/summary' && method === 'GET') return json({ ok: true, ...(await platformCounts(env)) });

  // ---------- 입점·공간 등록·광고 신청 ----------
  if ((path === 'partners' || path === 'hosts') && method === 'GET') {
    const kind = str(url.searchParams.get('kind'), 10), status = str(url.searchParams.get('status'), 10);
    const where = [], b = [];
    if (kind) { if (kind === 'host') where.push("(kind = 'host' OR kind IS NULL)"); else { where.push('kind = ?'); b.push(kind); } }
    if (status) { where.push('status = ?'); b.push(status); }
    const { results } = await env.DB.prepare(`SELECT ref, status, kind, data, memo, created_at, updated_at, (SELECT slug FROM listings l WHERE l.host_ref = h.ref ORDER BY l.id DESC LIMIT 1) AS listing FROM host_applications h ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 300`).bind(...b).all();
    return json({ ok: true, statuses: PARTNER_STATUS, kinds: PARTNER_KINDS, items: (results || []).map(r => ({ ...r, kind: r.kind || 'host', data: safeJson(r.data) })) });
  }
  let m = path.match(/^partners\/(HS-\d{4}-[A-Z0-9]{4})$/);
  if (m && method === 'PATCH') {
    const { d, e } = await body(request); if (e) return e;
    const row = await env.DB.prepare('SELECT ref, status FROM host_applications WHERE ref = ?').bind(m[1]).first();
    if (!row) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const status = d.status === undefined ? row.status : (PARTNER_STATUS.includes(d.status) ? d.status : null);
    if (!status) return err('상태 값이 올바르지 않습니다.');
    await env.DB.prepare('UPDATE host_applications SET status = ?, memo = COALESCE(?, memo), updated_at = ? WHERE ref = ?').bind(status, d.memo === undefined ? null : str(d.memo, 2000), t, m[1]).run();
    await log(env, 'partner.updated', m[1], 'admin', { from: row.status, to: status });
    return json({ ok: true });
  }
  m = path.match(/^partners\/(HS-\d{4}-[A-Z0-9]{4})\/listing$/);
  if (m && method === 'POST') {   // 공간 등록 신청 내용으로 등록 공간 초안을 만듭니다
    const row = await env.DB.prepare('SELECT ref, kind, data FROM host_applications WHERE ref = ?').bind(m[1]).first();
    if (!row) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const a = safeJson(row.data);
    const have = await env.DB.prepare('SELECT slug FROM listings WHERE host_ref = ? LIMIT 1').bind(m[1]).first();
    if (have) return json({ ok: true, id: have.slug, existed: true });
    const L = cleanListing({ name: a.space_name, region: a.region, address: [a.address, a.floor].filter(Boolean).join(' '), area: a.area, capacity: a.capacity, space_type: a.space_type,
      summary: a.intro ? a.intro.slice(0, 110) : '', description: a.intro || '', features: a.features, purposes: a.purposes, themes: a.themes, photos: a.photos,
      price_note: a.price_base || '', hours: a.hours || '', rules: a.rules || '', host_name: a.biz_name || '', host_biz: [a.biz_name, a.biz_no ? '사업자등록번호 ' + a.biz_no : ''].filter(Boolean).join(' · '), station: a.station || '' });
    if (L.error) return err(L.error);
    const slug = await uniqueRef(env, 'listings', 'slug', 'L');
    await env.DB.prepare('INSERT INTO listings (slug, status, name, region, address, area, capacity, host_ref, sort, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(slug, 'draft', L.name, L.region, L.address, L.area, L.capacity, m[1], 0, JSON.stringify(L), t).run();
    await log(env, 'listing.created', slug, 'admin', { from: m[1] });
    return json({ ok: true, id: slug });
  }

  // ---------- 등록 공간 ----------
  if (path === 'listings' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT slug, status, name, region, address, area, capacity, host_ref, sort, data, created_at, updated_at FROM listings ORDER BY CASE status WHEN \'published\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END, sort DESC, id DESC LIMIT 300').all();
    return json({ ok: true, statuses: LISTING_STATUS, items: (results || []).map(r => ({ ...publicListing(r), host_ref: r.host_ref || '', sort: r.sort, created_at: r.created_at, updated_at: r.updated_at })) });
  }
  if (path === 'listings' && method === 'POST') {
    const { d, e } = await body(request); if (e) return e;
    const L = cleanListing(d); if (L.error) return err(L.error);
    const slug = await uniqueRef(env, 'listings', 'slug', 'L');
    await env.DB.prepare('INSERT INTO listings (slug, status, name, region, address, area, capacity, host_ref, sort, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .bind(slug, d.status === 'published' ? 'published' : 'draft', L.name, L.region, L.address, L.area, L.capacity, str(d.host_ref, 20) || null, num(d.sort) || 0, JSON.stringify(L), t).run();
    await log(env, 'listing.created', slug, 'admin', {});
    return json({ ok: true, id: slug });
  }
  m = path.match(/^listings\/(L-\d{4}-[A-Z0-9]{4})$/);
  if (m && (method === 'PUT' || method === 'PATCH')) {
    const { d, e } = await body(request); if (e) return e;
    const row = await env.DB.prepare('SELECT slug, status FROM listings WHERE slug = ?').bind(m[1]).first();
    if (!row) return err('공간을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    if (method === 'PUT') {
      const L = cleanListing(d); if (L.error) return err(L.error);
      await env.DB.prepare('UPDATE listings SET name = ?, region = ?, address = ?, area = ?, capacity = ?, sort = ?, data = ?, updated_at = ? WHERE slug = ?')
        .bind(L.name, L.region, L.address, L.area, L.capacity, num(d.sort) || 0, JSON.stringify(L), t, m[1]).run();
    }
    if (d.status !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(LISTING_STATUS, d.status)) return err('상태 값이 올바르지 않습니다.');
      await env.DB.prepare('UPDATE listings SET status = ?, updated_at = ? WHERE slug = ?').bind(d.status, t, m[1]).run();
    }
    await log(env, 'listing.updated', m[1], 'admin', { status: d.status || row.status, edit: method === 'PUT' });
    return json({ ok: true });
  }

  // ---------- 모임 ----------
  if (path === 'meetups' && method === 'GET') {
    const st = str(url.searchParams.get('status'), 12), today = kstToday();
    const where = [], b = [];
    if (st === 'past') { where.push("status IN ('open','closed') AND event_date < ?"); b.push(today); }
    else if (st === 'open' || st === 'closed') { where.push('status = ? AND event_date >= ?'); b.push(st, today); }
    else if (st) { where.push('status = ?'); b.push(st); }
    const { results } = await env.DB.prepare(`SELECT ${MCOLS}, (SELECT COALESCE(SUM(a.people),0) FROM meetup_apps a WHERE a.meetup_ref = m.ref AND a.status IN ('confirmed','pending')) AS seats,
      (SELECT COALESCE(SUM(a.people),0) FROM meetup_apps a WHERE a.meetup_ref = m.ref AND a.status = 'waitlist') AS waiting FROM meetups m ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, event_date DESC, created_at DESC LIMIT 300`).bind(...b).all();
    return json({ ok: true, statuses: MEETUP_STATUS, items: (results || []).map(r => { const d = safeJson(r.data); return { ...publicMeetup(r, r, { full: false, today }), raw_status: r.status, host_phone: d.host_phone || '', admin_note: d.admin_note || '' }; }) });
  }
  m = path.match(/^meetups\/(MO-\d{4}-[A-Z0-9]{4})$/);
  if (m && method === 'GET') {
    const row = await env.DB.prepare(`SELECT ${MCOLS} FROM meetups WHERE ref = ?`).bind(m[1]).first();
    if (!row) return err('모임을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const d = safeJson(row.data);
    const { results } = await env.DB.prepare('SELECT ref, status, name, phone, people, data, created_at FROM meetup_apps WHERE meetup_ref = ? ORDER BY created_at, id').bind(m[1]).all();
    const { results: lg } = await env.DB.prepare('SELECT kind, actor, detail, created_at FROM event_log WHERE ref = ? ORDER BY id DESC LIMIT 40').bind(m[1]).all();
    const k = await meetupToken(env, m[1]);
    return json({ ok: true, item: { ...publicMeetup(row, await meetupCounts(env, m[1])), raw_status: row.status, host_phone: d.host_phone || '', host_email: d.host_email || '', booking_code: d.booking_code || '', admin_note: d.admin_note || '', reject_reason: d.reject_reason || '', manage_url: manageUrl(url.origin, m[1], k) },
      apps: (results || []).map(a => { const x = safeJson(a.data); return { ref: a.ref, status: a.status, status_label: APP_STATUS[a.status], name: a.name, phone: a.phone, people: a.people, answer: x.answer || '', message: x.message || '', created_at: a.created_at }; }),
      log: lg || [], venues: MEETUP_VENUES, cats: MEETUP_CATS });
  }
  if (m && method === 'PATCH') {
    const { d, e } = await body(request); if (e) return e;
    const row = await env.DB.prepare(`SELECT ${MCOLS} FROM meetups WHERE ref = ?`).bind(m[1]).first();
    if (!row) return err('모임을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    const cur = safeJson(row.data);
    let status = row.status, title = row.title, category = row.category, venue = row.venue, date = row.event_date, capacity = row.capacity;
    if (d.status !== undefined) { if (!['pending', 'open', 'closed', 'cancelled', 'rejected', 'hidden'].includes(d.status)) return err('상태 값이 올바르지 않습니다.'); status = d.status; }
    if (d.edit) {   // 내용 고치기 (오탈자·부적절한 표현 등)
      const p = cleanMeetup({ ...cur, title: row.title, category: row.category, venue: row.venue, date: row.event_date, capacity: row.capacity, ...d.edit }, { partial: true });
      if (!p.title || !p.summary) return err('모임 이름과 한 줄 소개는 비울 수 없습니다.');
      if (!isDate(p.date)) return err('모임 날짜를 확인해 주세요.');
      if (!p.capacity) return err('정원은 2명 이상이어야 합니다.');
      title = p.title; category = p.category || row.category; venue = p.venue || row.venue; date = p.date; capacity = p.capacity;
      for (const k of ['summary', 'description', 'for_whom', 'start_time', 'end_time', 'venue_text', 'min_people', 'max_per', 'mode', 'waitlist', 'deadline', 'fee_type', 'fee', 'fee_note', 'question', 'cover', 'tags', 'host_name', 'host_intro', 'contact_url']) cur[k] = p[k];
    }
    if (d.admin_note !== undefined) cur.admin_note = str(d.admin_note, 1000);
    if (d.reject_reason !== undefined) cur.reject_reason = str(d.reject_reason, 300);
    if (d.notice !== undefined) cur.notice = str(d.notice, 1000);
    const featured = d.featured === undefined ? row.featured : (d.featured ? 1 : 0), verified = d.verified === undefined ? row.verified : (d.verified ? 1 : 0);
    await env.DB.prepare('UPDATE meetups SET status = ?, title = ?, category = ?, venue = ?, event_date = ?, capacity = ?, featured = ?, verified = ?, data = ?, updated_at = ? WHERE ref = ?')
      .bind(status, title, category, venue, date, capacity, featured, verified, JSON.stringify(cur), t, m[1]).run();
    await log(env, 'meetup.admin', m[1], 'admin', { from: row.status, to: status, featured, verified, edit: !!d.edit });
    if (capacity > (row.capacity || 0)) { const moved = await promoteWaitlist(env, m[1], t); if (moved.length) await log(env, 'meetup.promoted', m[1], 'system', { apps: moved }); }
    return json({ ok: true, status, status_label: MEETUP_STATUS[viewStatus({ status, event_date: date, data: JSON.stringify(cur) })] });
  }
  m = path.match(/^meetups\/(MO-\d{4}-[A-Z0-9]{4})\/apps\/(AP-\d{4}-[A-Z0-9]{4})$/);
  if (m && method === 'PATCH') {
    const { d, e } = await body(request); if (e) return e;
    if (!Object.prototype.hasOwnProperty.call(APP_STATUS, d.status)) return err('상태 값이 올바르지 않습니다.');
    const a = await env.DB.prepare('SELECT status FROM meetup_apps WHERE ref = ? AND meetup_ref = ?').bind(m[2], m[1]).first();
    if (!a) return err('신청을 찾을 수 없습니다.', 404, 'NOT_FOUND');
    await env.DB.prepare('UPDATE meetup_apps SET status = ?, updated_at = ? WHERE ref = ?').bind(d.status, t, m[2]).run();
    await log(env, 'meetup.app_status', m[1], 'admin', { app: m[2], from: a.status, to: d.status });
    return json({ ok: true });
  }

  // ---------- 배너 광고 ----------
  if (path === 'ads' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, slot, status, kind, title, advertiser, link, start_date, end_date, priority, imps, clicks, data, created_at, updated_at FROM ads ORDER BY status DESC, slot, priority DESC, id DESC LIMIT 300').all();
    return json({ ok: true, slots: AD_SLOTS, today: kstToday(), items: (results || []).map(r => ({ ...r, data: safeJson(r.data) })) });
  }
  if (path === 'ads' && method === 'POST') {
    const { d, e } = await body(request); if (e) return e;
    const a = cleanAd(d); if (a.error) return err(a.error);
    const r = await env.DB.prepare('INSERT INTO ads (slot, status, kind, title, advertiser, link, start_date, end_date, priority, imps, clicks, data, created_at) VALUES (?,?,?,?,?,?,?,?,?,0,0,?,?)')
      .bind(a.slot, a.status, a.kind, a.title, a.advertiser, a.link, a.start_date || null, a.end_date || null, a.priority, JSON.stringify({ sub: a.sub, cta: a.cta, image: a.image, theme: a.theme, memo: a.memo }), t).run();
    const id = (r && r.meta && r.meta.last_row_id) || (r && r.lastInsertRowid) || ((await env.DB.prepare('SELECT MAX(id) AS id FROM ads').first()) || {}).id;
    await log(env, 'ad.created', String(id), 'admin', { slot: a.slot, title: a.title, status: a.status });
    return json({ ok: true, id: Number(id) });
  }
  m = path.match(/^ads\/(\d+)$/);
  if (m && ['PUT', 'PATCH', 'DELETE'].includes(method)) {
    const id = +m[1];
    const row = await env.DB.prepare('SELECT id, status FROM ads WHERE id = ?').bind(id).first();
    if (!row) return err('광고를 찾을 수 없습니다.', 404, 'NOT_FOUND');
    if (method === 'DELETE') { await env.DB.prepare('DELETE FROM ads WHERE id = ?').bind(id).run(); await log(env, 'ad.deleted', String(id), 'admin', {}); return json({ ok: true }); }
    const { d, e } = await body(request); if (e) return e;
    if (method === 'PUT') {
      const a = cleanAd(d); if (a.error) return err(a.error);
      await env.DB.prepare('UPDATE ads SET slot = ?, status = ?, kind = ?, title = ?, advertiser = ?, link = ?, start_date = ?, end_date = ?, priority = ?, data = ?, updated_at = ? WHERE id = ?')
        .bind(a.slot, a.status, a.kind, a.title, a.advertiser, a.link, a.start_date || null, a.end_date || null, a.priority, JSON.stringify({ sub: a.sub, cta: a.cta, image: a.image, theme: a.theme, memo: a.memo }), t, id).run();
    } else {
      if (!['on', 'off'].includes(d.status)) return err('상태 값이 올바르지 않습니다.');
      await env.DB.prepare('UPDATE ads SET status = ?, updated_at = ? WHERE id = ?').bind(d.status, t, id).run();
    }
    await log(env, 'ad.updated', String(id), 'admin', { status: d.status || row.status, edit: method === 'PUT' });
    return json({ ok: true });
  }
  return null;
}
