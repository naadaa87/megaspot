import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const ctx = vm.createContext({window: {}});
for (const path of ['data/holidays-kr', 'data/pricing-gundae', 'pricing-engine-v3.2']) {
  vm.runInContext(read(`assets/js/${path}.js`), ctx);
}
const price = ctx.window.MEGASPOT_PRICE;

function purpose(slug, question) {
  const html = read(`purpose/${slug}/index.html`);
  const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const faq = data['@graph'].find(item => item['@type'] === 'FAQPage');
  const answer = faq.mainEntity.find(item => item.name === question)?.acceptedAnswer.text;
  assert.ok(answer, question);
  assert.ok(html.includes(`<summary>${question}</summary><div class="body">${answer}</div>`), question);
  return {html, answer, data: data['@graph']};
}

test('목적별 가격 예시와 공개 FAQ가 현재 공간 요금으로 계산된다', () => {
  const cases = [
    ['class', '25명 클래스 비용은 어느 정도인가요?', '2026-11-23', 13, 16, 25],
    ['community', '평일 저녁 3시간 모임은 얼마인가요?', '2026-11-23', 19, 22, 30],
    ['culture', '토요일 저녁 공연 비용은 얼마인가요?', '2026-11-28', 18, 22, 80],
    ['networking', '금요일 저녁 리셉션은 얼마인가요?', '2026-11-27', 19, 23, 60],
  ];
  for (const [slug, question, date, start, end, people] of cases) {
    const {html, answer, data} = purpose(slug, question);
    const quote = price.quote({date, start, end, people});
    const total = price.man(quote.total);
    assert.ok(answer.includes(`총 ${total}`), slug);
    assert.ok(answer.includes(`예약 기본료 ${price.man(quote.surcharge)}`), slug);
    if (quote.peopleExtra) assert.ok(answer.includes(`초과 인원 ${quote.peopleExtra}명에 대한 ${price.man(quote.peopleFee)}`), slug);
    assert.ok(html.match(/<meta name="description" content="([^"]+)"/)[1].includes(total), slug);
    assert.ok(data.find(item => item['@type'] === 'Service').description.includes(total), slug);
  }
});

test('평소 올나잇 FAQ는 요금표와 일치하고 종료된 종일 대관은 공용 안내에 없다', () => {
  const {answer} = purpose('party', '밤새 이용할 수 있나요?');
  const night = price.findPkg('allnight');
  for (const [label, col] of [['월–목', 'wd'], ['금요일', 'fri'], ['토요일', 'sat'], ['일요일', 'sun']]) {
    assert.ok(answer.includes(`${label} ${price.man(night.price[col])}`), label);
  }
  assert.doesNotMatch(read('terms/index.html'), /기간 한정 종일 대관/);
  for (const venue of ['megaspot-gundae', 'megaspot-gundae-2']) {
    assert.doesNotMatch(read(`spaces/${venue}/pricing/index.html`), /all-day-offer|pkg=full-day/);
  }
});
