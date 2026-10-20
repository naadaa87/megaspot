// 출장뷔페 신청 내용 검증 — 고객이 보낸 코스·인원·바베큐·생맥주를 서버에서 다시 계산해 저장합니다.
// 금액은 assets/js/data/catering.js(고객 안내 판매가, 부가세 별도)를 tools/build_site.py 가 _catalog.js 로 옮긴 값을 씁니다.
// 계산 방식은 assets/js/catering-calc.js 의 quote() 와 같습니다.
import { CATERING } from './_catalog.js';
const won = n => (Math.round(n) || 0).toLocaleString('ko-KR') + '원';
export function cateringQuote(o, fee) {   // fee: 관리자가 바꾼 출장·세팅비 (없으면 기본값)
  const D = CATERING; if (!D || !o) return null;
  const course = D.courses.find(x => x.id === String(o.course || '')) || null;
  const bbq = D.bbq.rows.find(x => x.id === String(o.bbq || '')) || null;
  const beer = Math.max(0, Math.min(20, Math.round(+o.beer || 0)));
  const people = Math.max(0, Math.min(999, Math.round(+o.people || 0)));
  let bill = 0, supply = 0;
  if (course) {
    if (course.kind === 'flat') { const t = people > 20 ? course.tiers[1] : course.tiers[0]; bill = t.people; supply += t.price; }
    else { bill = Math.max(people || course.min, course.min); supply += course.price * bill; }
  }
  if (bbq) supply += bbq.price;
  if (beer) supply += beer * D.beer.price;
  const dfee = fee != null && fee !== '' && Number.isFinite(+fee) ? Math.max(0, Math.min(1e7, Math.round(+fee))) : D.delivery.fee;
  if (supply) supply += dfee;
  const vat = Math.round(supply * D.vat);
  const parts = [];
  if (course) parts.push(course.name + (course.kind === 'flat' ? '' : ' 코스') + ' ' + bill + '명');
  if (bbq) parts.push('바베큐 ' + bbq.size);
  if (beer) parts.push('생맥주 ' + beer + '통');
  return { course: course ? course.id : '', course_name: course ? course.name : '', people, bill_people: bill, bbq: bbq ? bbq.id : '', bbq_name: bbq ? bbq.size : '', beer,
           fee: supply ? dfee : 0, supply, vat, total: supply + vat, version: D.version,
           summary: supply ? parts.join(' · ') + ' — 예상 ' + won(supply + vat) + ' (부가세 포함)' : '출장뷔페 상담 희망 (코스 미정' + (people ? ' · ' + people + '명' : '') + ')' };
}
// 신청서에서 '출장뷔페도 함께 상담받기'를 체크한 경우에만 값을 남깁니다.
export function cateringFrom(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c) || !c.on) return null;
  return cateringQuote(c);
}
// 관리자 화면 '출장뷔페'에서 문의에 저장하는 구성 (출장·세팅비 조정과 메모 포함)
export function cateringAdmin(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const q = cateringQuote(c, c.fee); if (!q) return null;
  q.note = String(c.note == null ? '' : c.note).slice(0, 300); q.by = 'admin';
  return q;
}
