// 공간 모음(/venues/…) — 인원·목적·지역별 모음 페이지에 공개 중인 입점 공간을 서버에서 끼워 넣습니다 (2026-11-13)
//  · 페이지 자체는 tools/seo-pages/build.mjs 가 만든 정적 HTML 입니다. 직영 공간 카드와 본문은 그 안에 들어 있습니다.
//  · 여기서는 목록 상자(#hub-list)의 data-people · data-types · data-region 조건에 맞는 입점 공간 카드를 <!--hub:host--> 자리에 넣고,
//    공간 수(#hub-count)와 구조화 데이터(#hub-itemlist)를 맞춥니다. 검색엔진이 스크립트 실행 없이 목록을 읽게 하려는 것입니다.
//  · 조회에 실패하거나 맞는 공간이 없으면 정적 페이지를 그대로 내보냅니다.
import { hasDb, kstToday } from './_lib.js';
import { TYPE_LABEL, REGION_LABEL, visibleSql, cardSpace } from './_hostplat.js';

const SITE = 'https://megaspot.kr', MARK = '<!--hub:host-->', LIMIT = 60;
const COVER = '(SELECT p.pid FROM host_photos p WHERE p.space_ref = s.ref ORDER BY p.sort, p.id LIMIT 1) AS cover';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = n => Number(n || 0).toLocaleString('ko-KR') + '원';
const man = n => { n = Number(n || 0); if (n >= 10000 && n % 1000 === 0) { const m = n / 10000; return (m % 1 === 0 ? m.toLocaleString('ko-KR') : m.toFixed(1)) + '만 원'; } return won(n); };

// 목록 상자에 적힌 조건을 읽습니다. 조건이 없는 페이지(가이드 등)는 null.
export function hubFilter(html) {
  const tag = (String(html).match(/<[a-z]+\b[^>]*\bid="hub-list"[^>]*>/i) || [])[0]; if (!tag) return null;
  const attr = k => (tag.match(new RegExp('\\bdata-' + k + '="([^"]*)"')) || [])[1] || '';
  const people = Math.max(0, Math.min(99999, parseInt(attr('people'), 10) || 0));
  const types = attr('types').split(',').map(t => t.trim()).filter(t => TYPE_LABEL[t]).slice(0, 12);
  const region = REGION_LABEL[attr('region')] ? attr('region') : '';
  return { people, types, region };
}

export async function hubSpaces(env, f, limit = LIMIT) {
  const today = kstToday(), where = [visibleSql()], bind = [today, today];
  if (f.region) { where.push('s.region = ?'); bind.push(f.region); }
  if (f.people) { where.push('s.capacity >= ?'); bind.push(f.people); }
  if (f.types.length) { where.push('(' + f.types.map(() => 's.types LIKE ?').join(' OR ') + ')'); for (const t of f.types) bind.push('%"' + t + '"%'); }
  const { results } = await env.DB.prepare(`SELECT s.*, ${COVER} FROM host_spaces s WHERE ${where.join(' AND ')} ORDER BY s.boost DESC, CASE s.tier WHEN 'mega' THEN 0 ELSE 1 END, s.capacity DESC, s.id DESC LIMIT ?`).bind(...bind, limit).all();
  return (results || []).map(r => cardSpace(r, r.cover));
}

// 화면 스크립트(platform-ui.js 의 venueCard)와 같은 모양의 카드
export function hostCardHtml(c) {
  const lead = c.price_basis === 'hourly' ? '시간당 ' : c.price_basis === 'daily' ? '하루 ' : c.price_basis === 'package' ? '패키지 ' : '';
  const price = c.price_from ? lead + man(c.price_from) + '부터' + (c.vat === 'excluded' ? ' (부가세 별도)' : '') : '견적 문의';
  const loc = c.address && c.region_label && c.address.indexOf(c.region_label) === 0 ? c.address : [c.region_label, c.address].filter(Boolean).join(' · ');
  return `<a class="space-card vn-card" href="/spaces/view/?id=${encodeURIComponent(c.id)}" data-venue="${esc(c.id)}">`
    + `<div class="ph">${c.cover ? `<img src="${esc(c.cover)}" alt="${esc(c.name)} 대표 사진" loading="lazy">` : '<div class="vn-noimg">사진 준비 중</div>'}<span class="badge badge-host">입점 호스트</span></div>`
    + `<div class="bd"><div class="row between"><h3>${esc(c.name)}</h3>${c.tier ? `<span class="pf-tier t-${esc(c.tier)}">${c.tier === 'mega' ? '초대형' : '대형'}</span>` : ''}</div>`
    + `<div class="loc">${esc(loc)}${c.station ? ' · ' + esc(c.station) : ''}</div>`
    + (c.summary ? `<p class="mt-1 small muted">${esc(c.summary)}</p>` : '')
    + `<div class="specs">${c.area ? `<span><b>${esc(c.area)}</b>평</span>` : ''}${c.capacity ? `<span>최대 <b>${esc(c.capacity)}</b>명</span>` : ''}<span class="price">${esc(price)}</span></div>`
    + `<div class="tags mt-2">${(c.type_labels || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>`
    + '<div class="foot"><span class="muted">결제 수수료 없이 호스트와 직접 예약</span><span style="font-weight:700;color:var(--cobalt)">자세히 보기 →</span></div></div></a>';
}

// 정적 페이지에 카드·공간 수·구조화 데이터를 채웁니다. 자리 표시가 없으면 손대지 않습니다.
export function fillHub(html, cards) {
  if (!cards.length || !html.includes(MARK)) return html;
  let out = html.replace(MARK, cards.map(hostCardHtml).join('\n'));
  out = out.replace(/(<[a-z]+\b[^>]*\bid="hub-count"[^>]*>[^<]*<b>)(\d+)(<\/b>)/i, (m, a, n, b) => a + (Number(n) + cards.length) + b);
  out = out.replace(/(<script type="application\/ld\+json" id="hub-itemlist">)([\s\S]*?)(<\/script>)/, (m, a, body, b) => {
    try {
      const ld = JSON.parse(body), list = Array.isArray(ld.itemListElement) ? ld.itemListElement : [];
      for (const c of cards) list.push({ '@type': 'ListItem', position: list.length + 1, name: c.name, url: `${SITE}/spaces/view/?id=${c.id}` });
      ld.itemListElement = list; ld.numberOfItems = list.length;
      return a + JSON.stringify(ld).replace(/</g, '\\u003c') + b;
    } catch { return m; }
  });
  return out;
}

export async function serveHub(context) {
  const { request, env } = context;
  const page = await (typeof context.next === 'function' ? context.next() : env.ASSETS.fetch(request));
  try {
    if (request.method !== 'GET' || !hasDb(env) || page.status !== 200 || !(page.headers.get('content-type') || '').includes('text/html')) return page;
    const html = await page.clone().text(), f = hubFilter(html); if (!f) return page;
    const cards = await hubSpaces(env, f); if (!cards.length) return page;
    const headers = new Headers(page.headers); headers.delete('content-length'); headers.delete('etag'); headers.set('cache-control', 'public, max-age=300');
    return new Response(fillHub(html, cards), { status: 200, headers });
  } catch (e) { console.error('hub page', e && e.message); return page; }
}
