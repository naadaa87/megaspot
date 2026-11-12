// 행사 지원 요청 공통 — 맡길 수 있는 항목 · 고객에게 보여 주는 정보 (planning.js 와 hq/[[path]].js 가 함께 씁니다)
import { safeJson } from './_platform.js';
import { PLANNING_STATUS, PURPOSE_LABEL, REGION_LABEL, ADDON_LABEL } from './_hostplat.js';

export const PLANNING_NEEDS = { space: '공간 찾기·예약', ...ADDON_LABEL, etc: '그 밖의 준비' };
export const PLANNING_REF = /^PL-\d{4}-[A-Z0-9]{4}$/;
export function publicPlanning(row) {
  const d = safeJson(row.data), p = safeJson(row.proposal);
  return { ref: row.ref, status: row.status, status_label: PLANNING_STATUS[row.status] || row.status, name: row.name, date: row.event_date || '', date_note: d.date_note || '', people: row.people, budget_pp: row.budget_pp,
    budget_total: row.people && row.budget_pp ? row.people * row.budget_pp : null, region: row.region || '', region_label: REGION_LABEL[row.region] || '', purpose_label: PURPOSE_LABEL[d.purpose] || '', needs: (d.needs || []).map(n => PLANNING_NEEDS[n] || n),
    space: d.space || '', message: d.message || '', proposal: p.summary || p.amount || p.link ? { summary: p.summary || '', amount: p.amount ?? null, link: p.link || '', sent_at: p.sent_at || '' } : null, created_at: row.created_at };
}
