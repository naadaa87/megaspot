// 관리자 '수납 장부' (2026-11-28)
//  · 고객(예약)마다 수납·환불·보증금·추가 청구·할인을 수납일자·수납방법과 함께 적고, 받을 돈과 맞춰 남은 금액을 계산한다
//  · 수납방법: 계좌이체(법인)·계좌이체(개인)·온라인(페이앱)·현장결제(포스기)·현금·기타(직접 입력)
//  · 기존 시스템 결제 기록(페이앱·결제링크·이용료 수납·정산)은 참고로만 보여 주고, 한 건씩 옮기며 두 번 옮기지 않는다
//  · 기존 예약·문의·주문·결제·정산 표는 한 글자도 바뀌지 않는다 — 새 표 세 개에만 쓴다
//   node --test tests/ledger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/admin-fixture.mjs';
import { kstToday } from '../functions/api/_lib.js';
import { METHODS, summarize } from '../functions/api/_ledger.js';

const TODAY = kstToday(), YESTERDAY = kstToday(-1);
const NEW_TABLES = ['ledger_entries', 'ledger_bookings', 'ledger_revisions'];
let seq = 0;
const rid = () => 'test-req-' + String(++seq).padStart(6, '0');

function seed(f) {
  const db = f.db, at = o => new Date(Date.now() + o * 864e5).toISOString().slice(0, 19).replace('T', ' ');
  const add = (code, offset, amount, status = 'confirmed', phone = '010-2222-3333') => db.prepare('INSERT INTO bookings(booking_code,space_id,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(code, 'megaspot-gundae', '고객 ' + code, phone, phone.slice(-4), kstToday(offset), 50, status, amount, 18, 22, at(-30));
  add('BK-ON', 10, 1000000); add('BK-PAST', -4, 600000, 'completed'); add('BK-PAST2', -40, 300000, 'completed'); add('BK-LINK', 12, 900000, 'confirmed', '010-9999-8888');
  const order = (oid, code, price, status, o, linkCode) => {
    db.prepare("INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,test,booking_code,created_at,paid_at) VALUES(?,?,?,?,?,?,?,'{}',?,0,?,?,?)").run(oid, linkCode ? 'admin-payment-rental' : 'venue', linkCode ? '잔금 결제' : '대관 예약금', kstToday(10), price, '구매자', '01011112222', status, linkCode ? null : code, at(o), at(o));
    db.prepare('INSERT INTO payapp_payments(oid,nonce,merchant_userid,mul_no,created_at) VALUES(?,?,?,?,?)').run(oid, 'n-' + oid, 'seller', 'M' + oid.slice(-6), at(o));
  };
  order('MSORDER00001', 'BK-ON', 300000, 'paid', -3);
  order('MSORDER00002', 'BK-ON', 100000, 'paid', -2); db.prepare('INSERT INTO payapp_refunds(mul_no,oid,amount,created_at) VALUES(?,?,?,?)').run('R-0001', 'MSORDER00002', 40000, at(-1));
  db.prepare("INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES('BK-PAST','old-1','receipt',200000,'11/20 통장 입금',?)").run(at(-6));
  order('MSLINK000001', null, 200000, 'paid', -1, 'BK-LINK');
  db.prepare("INSERT INTO payment_links(id,request_id,request_fingerprint,token,token_hash,service,purpose,title,description,amount,booking_code,expires_at,status,order_oid,created_at,updated_at) VALUES('L1','req-link-0001','fp','tok','toh','rental','balance','잔금 결제','건대 잔금',200000,'BK-LINK',9999999999,'closed','MSLINK000001',?,?)").run(at(-2), at(-2));
}
// 새 표를 뺀 모든 표의 내용
function snapshot(db) {
  const out = {};
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all()) {
    if (NEW_TABLES.includes(name)) continue;
    out[name] = name === 'sqlite_sequence' ? db.prepare('SELECT * FROM sqlite_sequence WHERE name NOT LIKE ? ORDER BY name').all('ledger%') : db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all();
  }
  return JSON.stringify(out);
}
const entry = (f, code, body, status = 200) => f.api('ledger/' + code + '/entries', 'POST', { request_id: rid(), paid_on: TODAY, ...body }, status);

test('수납방법은 요청한 여섯 가지이고, 기타는 직접 입력해야 한다', async () => {
  assert.deepEqual(Object.values(METHODS), ['계좌이체(법인)', '계좌이체(개인)', '온라인(페이앱)', '현장결제(포스기)', '현금', '기타']);
  const f = fixture({ booking: true });
  for (const method of Object.keys(METHODS)) await entry(f, 'BK-TEST', { kind: 'receipt', amount: 10000, method, method_note: method === 'other' ? '상품권' : '' });
  const err = async (body, re) => { const r = await entry(f, 'BK-TEST', body, 400); assert.match(r.error, re); };
  await err({ kind: 'receipt', amount: 10000, method: 'other' }, /직접 적어/);
  await err({ kind: 'receipt', amount: 10000 }, /수납방법을 골라/);
  await err({ kind: 'receipt', amount: 10000, method: 'card' }, /수납방법을 골라/);
  await err({ kind: 'receipt', amount: 0, method: 'cash' }, /금액/);
  await err({ kind: 'receipt', amount: 1.5, method: 'cash' }, /금액/);
  await err({ kind: 'receipt', amount: 10000, method: 'cash', paid_on: kstToday(1) }, /오늘 이후/);
  await err({ kind: 'receipt', amount: 10000, method: 'cash', paid_on: '2026-02-30' }, /수납일자/);
  await err({ kind: 'paid', amount: 10000, method: 'cash' }, /종류/);
  await err({ kind: 'charge', amount: 50000 }, /사유/);
  await f.api('ledger/BK-NONE/entries', 'POST', { request_id: rid(), kind: 'receipt', amount: 1000, method: 'cash', paid_on: TODAY }, 404);
  const d = await f.api('ledger/BK-TEST');
  assert.deepEqual(d.entries.map(e => e.method_label).sort(), ['계좌이체(개인)', '계좌이체(법인)', '기타 · 상품권', '온라인(페이앱)', '현금', '현장결제(포스기)']);
  assert.equal(d.ledger.received, 60000); assert.equal(d.ledger.balance, 440000); assert.equal(d.ledger.status, 'partial');
});

test('받을 돈·받은 돈·남은 금액: 추가 청구·할인·환불·보증금·초과 수납', async () => {
  const f = fixture({ booking: true });
  let d = await f.api('ledger/BK-TEST'); assert.equal(d.ledger.billed, 500000); assert.equal(d.ledger.status, 'unpaid');
  await entry(f, 'BK-TEST', { kind: 'receipt', amount: 200000, method: 'bank_corp', payer: '(주)검증', proof: 'tax_invoice', ref_no: '' });
  await entry(f, 'BK-TEST', { kind: 'charge', amount: 100000, memo: '2시간 연장' });
  await entry(f, 'BK-TEST', { kind: 'discount', amount: 50000, memo: '재방문 할인' });
  await entry(f, 'BK-TEST', { kind: 'deposit_in', amount: 150000, method: 'bank_personal' });
  d = await f.api('ledger/BK-TEST');
  assert.equal(d.ledger.billed, 550000); assert.equal(d.ledger.received, 200000); assert.equal(d.ledger.balance, 350000);
  assert.deepEqual(d.ledger.deposit, { in: 150000, out: 0, held: 150000 }, '보증금은 남은 금액과 따로 셉니다');
  // 환불은 받은 돈을 넘을 수 없고, 보증금 반환은 받은 보증금을 넘을 수 없습니다
  assert.match((await entry(f, 'BK-TEST', { kind: 'refund', amount: 200001, method: 'bank_corp' }, 400)).error, /환불 금액/);
  assert.match((await entry(f, 'BK-TEST', { kind: 'deposit_out', amount: 150001, method: 'bank_personal' }, 400)).error, /보증금 반환/);
  await entry(f, 'BK-TEST', { kind: 'receipt', amount: 400000, method: 'pos', ref_no: '30012345', proof: 'card' });
  d = await f.api('ledger/BK-TEST'); assert.equal(d.ledger.status, 'over'); assert.equal(d.ledger.balance, -50000);
  await entry(f, 'BK-TEST', { kind: 'refund', amount: 50000, method: 'bank_corp', memo: '초과분 반환' });
  await entry(f, 'BK-TEST', { kind: 'deposit_out', amount: 150000, method: 'bank_personal' });
  d = await f.api('ledger/BK-TEST');
  assert.equal(d.ledger.status, 'paid'); assert.equal(d.ledger.balance, 0); assert.equal(d.ledger.deposit.held, 0);
  assert.equal(d.ledger.last_receipt.method_label, '현장결제(포스기)');
  // 예약 금액 대신 청구 기준 금액을 정하려면 이유가 필요합니다
  await f.api('ledger/BK-TEST/meta', 'POST', { base_override: 600000 }, 400);
  await f.api('ledger/BK-TEST/meta', 'POST', { base_override: 600000, base_reason: '계약서 금액 기준' });
  d = await f.api('ledger/BK-TEST'); assert.equal(d.ledger.billed, 650000); assert.equal(d.ledger.base_source, 'ledger'); assert.equal(d.ledger.booking_amount, 500000);
  await f.api('ledger/BK-TEST/meta', 'POST', { base_override: null });
  d = await f.api('ledger/BK-TEST'); assert.equal(d.ledger.billed, 550000); assert.ok(d.history.some(h => h.action === 'meta'));
  assert.deepEqual(summarize({ base: null }).status, 'unbilled');
});

test('기존 결제 기록 옮기기: 온라인·환불·결제링크·수기 기록, 두 번 옮기지 않고 금액이 같아야 한다', async () => {
  const f = fixture({ booking: true }); seed(f);
  let d = await f.api('ledger/BK-ON'), refs = d.system.references;
  assert.deepEqual(refs.map(r => r.source).sort(), ['order:MSORDER00001', 'order:MSORDER00002', 'refund:legacy:MSORDER00002']);
  assert.equal(d.ledger.sync, true); assert.equal(d.ledger.unrecorded, 360000);
  const refund = refs.find(r => r.kind === 'refund'); assert.equal(refund.amount, 40000); assert.equal(refund.method, 'payapp');
  const o1 = refs.find(r => r.source === 'order:MSORDER00001');
  assert.match((await entry(f, 'BK-ON', { kind: 'receipt', amount: 299000, method: 'payapp', source_ref: o1.source }, 400)).error, /종류·금액이 같아야/);
  await entry(f, 'BK-ON', { kind: 'receipt', amount: o1.amount, method: 'payapp', paid_on: o1.date, source_ref: o1.source });
  assert.equal((await entry(f, 'BK-ON', { kind: 'receipt', amount: o1.amount, method: 'payapp', source_ref: o1.source }, 409)).code, 'LEDGER_SOURCE');
  await entry(f, 'BK-ON', { kind: 'receipt', amount: 1000, method: 'payapp', source_ref: 'order:MSNOTEXIST01' }, 409);
  d = await f.api('ledger/BK-ON');
  assert.equal(d.system.references.find(r => r.source === o1.source).done, true);
  // 온라인 결제는 장부의 온라인(페이앱) 기록과 따로 맞춰 봅니다 — 다른 수단으로 많이 받아도 미반영 온라인 결제는 남습니다
  await entry(f, 'BK-ON', { kind: 'receipt', amount: 500000, method: 'bank_corp' });
  d = await f.api('ledger/BK-ON'); assert.equal(d.ledger.sync, true); assert.equal(d.ledger.unrecorded, 60000);
  for (const r of d.system.references.filter(x => !x.done)) await entry(f, 'BK-ON', { kind: r.kind, amount: r.amount, method: 'payapp', source_ref: r.source });
  d = await f.api('ledger/BK-ON'); assert.equal(d.ledger.sync, false); assert.equal(d.ledger.received, 860000);
  // 결제링크 결제(주문에 예약번호가 없는 결제)도 예약에 연결해 보여 줍니다
  d = await f.api('ledger/BK-LINK');
  assert.deepEqual(d.system.references.map(r => [r.source, r.amount, r.group]), [['link:MSLINK000001', 200000, '결제링크(페이앱)']]);
  assert.equal(d.system.net, 200000); assert.equal(d.ledger.sync, true);
  // 이용료 수납·정산의 수기 기록 → 수납방법은 담당자가 골라야 합니다
  d = await f.api('ledger/BK-PAST'); const m = d.system.references[0];
  assert.equal(m.source.startsWith('manual:'), true); assert.equal(m.method, ''); assert.equal(m.note, '11/20 통장 입금');
  await entry(f, 'BK-PAST', { kind: 'receipt', amount: 200000, source_ref: m.source }, 400);
  await entry(f, 'BK-PAST', { kind: 'receipt', amount: 200000, method: 'bank_personal', source_ref: m.source });
  // 차이가 있어도 확인을 마쳤다면 더 묻지 않습니다
  d = await f.api('ledger/BK-LINK'); assert.equal(d.ledger.sync, true);
  await f.api('ledger/BK-LINK/meta', 'POST', { checked: true });
  d = await f.api('ledger/BK-LINK'); assert.equal(d.ledger.sync, false); assert.ok(d.ledger.checked_at);
});

test('고치기·취소: 버전이 맞아야 하고, 취소한 기록은 남으며, 같은 저장 요청은 한 번만 들어간다', async () => {
  const f = fixture({ booking: true }); seed(f);
  const id = rid(), body = { request_id: id, kind: 'receipt', amount: 100000, method: 'cash', paid_on: TODAY, payer: '홍길동' };
  const a = await f.api('ledger/BK-TEST/entries', 'POST', body), b = await f.api('ledger/BK-TEST/entries', 'POST', body);
  assert.equal(b.duplicate, true); assert.equal(a.entry.id, b.entry.id);
  await f.api('ledger/BK-TEST/entries', 'POST', { ...body, amount: 200000 }, 409);
  const e = a.entry;
  await f.api('ledger/BK-TEST/entries/' + e.id, 'POST', { action: 'edit', version: e.version + 1, kind: 'receipt', amount: 120000, method: 'cash', paid_on: TODAY }, 409);
  const ed = await f.api('ledger/BK-TEST/entries/' + e.id, 'POST', { action: 'edit', version: e.version, kind: 'receipt', amount: 120000, method: 'bank_personal', paid_on: YESTERDAY, payer: '홍길동', reason: '금액 오타', recorded_by: '담당A' });
  assert.equal(ed.entry.amount, 120000); assert.equal(ed.entry.version, 2); assert.equal(ed.entry.paid_on, YESTERDAY);
  await f.api('ledger/BK-TEST/entries/' + e.id, 'POST', { action: 'void', version: 2 }, 400);
  await f.api('ledger/BK-TEST/entries/' + e.id, 'POST', { action: 'void', version: 2, reason: '두 번 적음' });
  await f.api('ledger/BK-TEST/entries/' + e.id, 'POST', { action: 'void', version: 3, reason: '또' }, 409);
  const d = await f.api('ledger/BK-TEST');
  assert.equal(d.ledger.received, 0); assert.equal(d.entries[0].state, 'void'); assert.equal(d.entries[0].void_reason, '두 번 적음');
  assert.deepEqual(d.history.map(h => h.action), ['void', 'edit', 'create']);
  assert.equal(d.history[1].before.amount, 100000); assert.equal(d.history[1].after.amount, 120000); assert.equal(d.history[1].recorded_by, '담당A');
  // 환불이 받은 돈보다 많아지는 취소는 막습니다
  const r = await entry(f, 'BK-TEST', { kind: 'receipt', amount: 50000, method: 'cash' });
  await entry(f, 'BK-TEST', { kind: 'refund', amount: 50000, method: 'cash' });
  assert.match((await f.api('ledger/BK-TEST/entries/' + r.entry.id, 'POST', { action: 'void', version: 1, reason: 'x' }, 400)).error, /많아집니다/);
  // 옮긴 기록은 종류·금액을 고칠 수 없고, 취소하면 다시 옮길 수 있습니다
  const src = (await f.api('ledger/BK-ON')).system.references.find(x => x.source === 'order:MSORDER00001');
  const moved = await entry(f, 'BK-ON', { kind: 'receipt', amount: src.amount, method: 'payapp', source_ref: src.source });
  await f.api('ledger/BK-ON/entries/' + moved.entry.id, 'POST', { action: 'edit', version: 1, kind: 'receipt', amount: 1000, method: 'payapp', paid_on: TODAY }, 400);
  await f.api('ledger/BK-ON/entries/' + moved.entry.id, 'POST', { action: 'edit', version: 1, kind: 'receipt', amount: src.amount, method: 'payapp', paid_on: TODAY, memo: '메모만 고침' });
  await f.api('ledger/BK-ON/entries/' + moved.entry.id, 'POST', { action: 'void', version: 2, reason: '잘못 옮김' });
  await entry(f, 'BK-ON', { kind: 'receipt', amount: src.amount, method: 'payapp', source_ref: src.source });
});

test('목록·수납 내역: 챙길 것·기한 지난 미수·장부 입력 필요, 수납방법별 합계', async () => {
  const f = fixture({ booking: true }); seed(f);
  await entry(f, 'BK-PAST2', { kind: 'receipt', amount: 300000, method: 'cash', paid_on: YESTERDAY });
  await entry(f, 'BK-TEST', { kind: 'receipt', amount: 100000, method: 'bank_corp' });
  await entry(f, 'BK-TEST', { kind: 'deposit_in', amount: 150000, method: 'bank_personal' });
  await entry(f, 'BK-TEST', { kind: 'charge', amount: 30000, memo: '현수막' });
  const r = await f.api('ledger'), x = c => r.items.find(i => i.code === c);
  assert.equal(x('BK-PAST').overdue, true, '이용일이 지난 미수는 기한 지남'); assert.equal(x('BK-PAST').after, true); assert.equal(x('BK-PAST').sync, true); assert.equal(x('BK-PAST').todo, true);
  assert.equal(x('BK-PAST2').status, 'paid'); assert.equal(x('BK-PAST2').todo, false);
  assert.equal(x('BK-ON').sync, true); assert.equal(x('BK-ON').todo, true);
  assert.equal(x('BK-TEST').billed, 530000); assert.equal(x('BK-TEST').last_receipt.method, 'bank_corp');
  assert.equal(r.counts.sync, 3); assert.equal(r.counts.overdue, 1);
  assert.equal(r.month.net, (TODAY.slice(0, 7) === YESTERDAY.slice(0, 7) ? 300000 : 0) + 100000);
  const j = await f.api('ledger/entries?from=' + YESTERDAY + '&to=' + TODAY);
  assert.equal(j.by_method.cash.receipt, 300000); assert.equal(j.by_method.bank_corp.net, 100000); assert.equal(j.by_method.bank_personal.deposit_in, 150000);
  assert.equal(j.by_method.bank_personal.net, 0, '보증금은 받은 돈 합계에 넣지 않습니다'); assert.equal(j.net, 400000); assert.equal(j.by_kind.charge, 30000);
  assert.equal(j.entries.length, 4); assert.equal(j.entries.find(e => e.kind === 'receipt' && e.method === 'cash').name, '고객 BK-PAST2');
  const only = await f.api('ledger/entries?from=' + YESTERDAY + '&to=' + TODAY + '&method=cash');
  assert.equal(only.entries.length, 1);
  // 수납 관리 화면도 장부 기준 받은 금액을 함께 보여 줍니다
  const co = await f.api('collections');
  assert.deepEqual(co.items.find(i => i.code === 'BK-TEST').ledger, { entries: 3, billed: 530000, received: 100000, balance: 430000, status: 'partial', status_label: '일부 수납', sync: false, unrecorded: 0 });
});

test('기존 예약·문의·주문·결제·정산 표는 그대로 — 새 표 세 개에만 쓴다', async () => {
  const f = fixture({ booking: true }); seed(f);
  const before = snapshot(f.db);
  await f.api('ledger'); await f.api('ledger/entries'); await f.api('ledger/BK-ON'); await f.api('ledger/BK-LINK'); await f.api('ledger/BK-PAST');
  for (const ref of (await f.api('ledger/BK-ON')).system.references) await entry(f, 'BK-ON', { kind: ref.kind, amount: ref.amount, method: 'payapp', source_ref: ref.source });
  const link = (await f.api('ledger/BK-LINK')).system.references[0]; await entry(f, 'BK-LINK', { kind: 'receipt', amount: link.amount, method: 'payapp', source_ref: link.source });
  const man = (await f.api('ledger/BK-PAST')).system.references[0]; await entry(f, 'BK-PAST', { kind: 'receipt', amount: man.amount, method: 'bank_personal', source_ref: man.source });
  for (const method of Object.keys(METHODS)) await entry(f, 'BK-TEST', { kind: 'receipt', amount: 10000, method, method_note: '상품권' });
  await entry(f, 'BK-TEST', { kind: 'refund', amount: 5000, method: 'cash' });
  await entry(f, 'BK-TEST', { kind: 'deposit_in', amount: 150000, method: 'bank_personal' });
  await entry(f, 'BK-TEST', { kind: 'deposit_out', amount: 150000, method: 'bank_personal' });
  await entry(f, 'BK-TEST', { kind: 'charge', amount: 10000, memo: '연장' });
  const e = await entry(f, 'BK-TEST', { kind: 'discount', amount: 10000, memo: '할인' });
  await f.api('ledger/BK-TEST/entries/' + e.entry.id, 'POST', { action: 'edit', version: 1, kind: 'discount', amount: 20000, paid_on: TODAY, memo: '할인 정정' });
  await f.api('ledger/BK-TEST/entries/' + e.entry.id, 'POST', { action: 'void', version: 2, reason: '할인 취소' });
  await f.api('ledger/BK-TEST/meta', 'POST', { base_override: 700000, base_reason: '계약서', checked: true, memo: '법인 결제' });
  await entry(f, 'BK-TEST', { kind: 'refund', amount: 999999, method: 'cash' }, 400);
  await f.api('collections');
  assert.equal(snapshot(f.db), before, '기존 표 내용이 그대로여야 합니다');
  assert.ok(f.db.prepare('SELECT COUNT(*) AS n FROM ledger_entries').get().n >= 15);
});

test('관리자 화면: 메뉴·스크립트·스타일 연결, 수납 관리에서 장부로 이동', () => {
  const html = readFileSync(new URL('../admin/index.html', import.meta.url), 'utf8');
  assert.match(html, /\/assets\/js\/pages\/admin-ledger\.js\?v=[0-9a-f]{12}/); assert.match(html, /\/assets\/css\/admin-ledger\.css\?v=[0-9a-f]{12}/);
  assert.ok(html.indexOf('admin-ledger.js') < html.indexOf('admin-navigation.js'), '메뉴를 만들기 전에 화면이 있어야 합니다');
  assert.match(readFileSync(new URL('../assets/js/pages/admin-navigation.js', import.meta.url), 'utf8'), /\['ledger','수납 장부'\]/);
  const js = readFileSync(new URL('../assets/js/pages/admin-ledger.js', import.meta.url), 'utf8');
  for (const s of ["'/ledger'", "'/ledger/entries?from='", 'data-ledger-code', 'CSV', '\\ufeff']) assert.ok(js.includes(s), s);
  assert.ok(readFileSync(new URL('../assets/js/pages/admin-collections.js', import.meta.url), 'utf8').includes('data-ledger-code'));
  const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const t of NEW_TABLES) assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + t + ' '));
});
