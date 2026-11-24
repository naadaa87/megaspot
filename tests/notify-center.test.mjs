// 관리자 · 알림 센터 (2026-11-24) — 읽기 전용
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture } from './helpers/admin-fixture.mjs';
import { statusClass, maskReceiver, templates } from '../functions/api/_notify_center.js';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const nowUtc = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

function setup(t) {
  const f = fixture({ booking: true }); t.after(() => f.db.close());
  t.mock.method(globalThis, 'fetch', async () => { throw Error('외부 호출 금지'); });
  const at = nowUtc();
  f.db.prepare('INSERT INTO contract_messages (contract_id,booking_code,receiver_mask,receiver_hash,actor,status,provider_mid,error,created_at) VALUES (1,?,?,?,?,?,?,?,?)').run('BK-TEST', '010-****-5678', 'h', 'admin', 'failed', null, '템플릿 코드 없음', at);
  f.db.prepare('INSERT INTO invite_messages (invite_id,booking_code,receiver_mask,receiver_hash,actor,status,provider_mid,error,created_at) VALUES (1,?,?,?,?,?,?,?,?)').run('BK-TEST', '010-****-5678', 'h', 'admin', 'accepted', '9', null, at);
  f.db.prepare("INSERT INTO host_notifications (host_id,kind,ref,event_key,receiver,msg,status,error,request_id,provider_mid,created_at) VALUES (1,'inquiry','HB-2611-AAAA','k1','01098765432','본문','unknown',NULL,NULL,NULL,?)").run(at);
  return f;
}

test('발송 기록을 모아 보여 주고 실패·확인 필요 건을 따로 모은다', async t => {
  const f = setup(t);
  const r = await f.api('notify-center');
  assert.equal(r.ok, true);
  assert.equal(r.summary.contract.fail, 1);
  assert.equal(r.summary.invite.ok, 1);
  assert.equal(r.summary.host.check, 1);
  assert.equal(r.problems.length, 2);
  assert.deepEqual(r.missing, []);
  const fails = await f.api('notify-center?status=fail');
  assert.deepEqual(fails.items.map(x => x.source), ['contract']);
  const byRef = await f.api('notify-center?q=hb-2611');
  assert.deepEqual(byRef.items.map(x => x.source), ['host']);
  const byPhone = await f.api('notify-center?q=5432');
  assert.deepEqual(byPhone.items.map(x => x.source), ['host']);
});

test('받는 번호는 가려서 보여 주고, 연결 열쇠 값은 돌려주지 않는다', async t => {
  const f = setup(t);
  f.env.ALIGO_RELAY_SECRET = 'super-secret-relay-value'; f.env.RESEND_API_KEY = 're_secret_value';
  const r = await f.api('notify-center');
  const text = JSON.stringify(r);
  assert.ok(!text.includes('01098765432'));
  assert.ok(text.includes('010-****-5432'));
  assert.ok(!text.includes('super-secret-relay-value') && !text.includes('re_secret_value'));
  assert.equal(r.connection.find(c => c.key === 'ALIGO_RELAY_SECRET').ok, true);
  assert.equal(r.connection.find(c => c.key === 'ALIGO_SENDER_KEY').ok, false);
});

test('조회만 하며 발송 기록·예약 자료를 바꾸지 않고, 관리자만 볼 수 있다', async t => {
  const f = setup(t);
  const snap = () => JSON.stringify(f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(x => [x.name, f.db.prepare(`SELECT * FROM "${x.name}"`).all()]));
  const before = snap();
  await f.api('notify-center'); await f.api('notify-center?status=fail&source=contract');
  await f.api('notify-center', 'POST', {}, 405);
  assert.equal(snap(), before);
  const anon = await f.handle(new Request('https://local.test/api/admin/notify-center'));
  assert.equal(anon.status, 401);
});

test('상태 분류·번호 가리기·템플릿 목록', () => {
  assert.equal(statusClass('accepted'), 'ok'); assert.equal(statusClass('delivered'), 'ok');
  assert.equal(statusClass('failed'), 'fail'); assert.equal(statusClass('unknown'), 'check');
  assert.equal(statusClass('queued'), 'wait'); assert.equal(statusClass('held'), 'off');
  assert.equal(statusClass('accepted', 'test'), 'test');
  assert.equal(maskReceiver('010-1234-5678'), '010-****-5678');
  assert.equal(maskReceiver('010-****-5678'), '010-****-5678');
  const list = templates();
  assert.ok(list.length > 20 && list.every(x => x.name && x.content));
});

test('관리자 화면에는 새 메뉴만 더한다', () => {
  const html = read('admin/index.html');
  assert.match(html, /admin-notify-center\.js\?v=[0-9a-f]{12}/);
  assert.ok(html.indexOf('admin-notify-center.js') < html.indexOf('admin-navigation.js'));
  assert.match(read('assets/js/pages/admin-navigation.js'), /\['notify-center','알림 센터'\]/);
  const js = read('assets/js/pages/admin-notify-center.js');
  assert.ok(!/method\s*:\s*['"](POST|PUT|PATCH|DELETE)/.test(js));
});
