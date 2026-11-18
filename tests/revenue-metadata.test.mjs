import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {SCHEMA} from '../functions/api/_schema.js';

function setup(t) {
  const f=fixture({booking:true,date:'2026-11-20'});
  t.after(()=>f.db.close());
  const result=f.db.prepare(`INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at)
    VALUES('BK-TEST','metadata-receipt','receipt',600000,'실제 입금 원본','2026-11-18 01:00:00')`).run();
  return {...f,id:'entry:'+result.lastInsertRowid};
}
const body=(id,extra={})=>({movement_id:id,channel:'bank_corporate',account:'블랭크',expected_version:0,
  components:[{id:'rental',amount:450000},{id:'cleaning',amount:100000},{id:'banner',amount:50000}],...extra});
const path=id=>'revenue/classifications?movement_id='+encodeURIComponent(id);

test('수납 원장을 보존하면서 결제 채널과 세부 매출 구성만 저장하고 변경 이력을 남긴다',async t=>{
  const {api,db,id}=setup(t);
  const original=db.prepare('SELECT * FROM booking_payment_entries').get();
  const first=await api(path(id));
  assert.equal(first.movement.amount,600000);
  assert.equal(first.metadata.version,0);
  assert.equal(first.metadata.components,null);
  const saved=await api('revenue/classifications','PUT',body(id));
  assert.equal(saved.metadata.channel,'bank_corporate');
  assert.equal(saved.metadata.account,'블랭크');
  assert.equal(saved.metadata.version,1);
  assert.deepEqual(saved.metadata.components,body(id).components);
  assert.deepEqual(db.prepare('SELECT * FROM booking_payment_entries').get(),original);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_payment_revisions').get().n,0);
  const audit=JSON.parse(db.prepare("SELECT detail FROM event_log WHERE kind='revenue.classification'").get().detail);
  assert.equal(audit.before.version,0);
  assert.equal(audit.after.account,'블랭크');

  await api('revenue/classifications','PUT',body(id,{channel:'bank_personal',account:'최준원개인',components:null,expected_version:1}));
  const updated=await api(path(id));
  assert.equal(updated.metadata.channel,'bank_personal');
  assert.equal(updated.metadata.account,'최준원개인');
  assert.equal(updated.metadata.components,null);
  assert.equal(updated.metadata.version,2);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='revenue.classification'").get().n,2);
});

test('구성 합계·항목·금액·채널·계좌·버전이 잘못되면 저장하지 않는다',async t=>{
  const {api,db,id}=setup(t);
  const invalid=[
    {components:[]},{components:[{id:'rental',amount:599999}]},
    {components:[{id:'rental',amount:500000},{id:'rental',amount:100000}]},
    {components:[{id:'rental',amount:600001},{id:'cleaning',amount:-1}]},
    {components:[{id:'rental',amount:'600000'}]},
    {components:[{id:'unknown-item',amount:600000}]},
    {components:[{id:'rental',amount:599999.5},{id:'banner',amount:.5}]},
    {channel:'corporate_account'},{account:1234},
    {account:'x'.repeat(81)},{account:'블랭크\n지유공간'},
    {expected_version:-1},{expected_version:'0'}
  ];
  for(const change of invalid) await api('revenue/classifications','PUT',body(id,change),400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_payment_metadata').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='revenue.classification'").get().n,0);
  await api('revenue/classifications','PUT',body(id,{components:[{id:'rental',amount:600000},{id:'people',amount:0}]}));
});

test('이전 버전의 분류 저장은 덮어쓰지 않고 다시 불러오도록 안내한다',async t=>{
  const {api,db,id}=setup(t);
  await api('revenue/classifications','PUT',body(id));
  const conflict=await api('revenue/classifications','PUT',body(id,{channel:'toss_terminal',account:'',components:null}),409);
  assert.equal(conflict.code,'REVENUE_METADATA_CHANGED');
  assert.equal(db.prepare('SELECT channel FROM revenue_payment_metadata').get().channel,'bank_corporate');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='revenue.classification'").get().n,1);
});

test('동시에 새 분류를 저장해도 한 요청만 성공하고 감사 이력도 한 번 남는다',async t=>{
  const {handle,env,db,id}=setup(t);
  // D1 serializes transactions; the in-memory fixture uses one SQLite connection.
  const batch=env.DB.batch.bind(env.DB);
  let pending=Promise.resolve();
  env.DB.batch=statements=>{
    const result=pending.then(()=>batch(statements));
    pending=result.catch(()=>{});
    return result;
  };
  const save=value=>handle(new Request('https://local.test/api/admin/revenue/classifications',{
    method:'PUT',headers:{'x-admin-key':env.ADMIN_KEY,origin:'https://local.test','content-type':'application/json'},body:JSON.stringify(value)
  }));
  const results=await Promise.all([
    save(body(id)),save(body(id,{channel:'spacecloud',account:'',components:null}))
  ]);
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_payment_metadata').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM event_log WHERE kind='revenue.classification'").get().n,1);
});

test('분류 변경 이력이 저장되지 않으면 분류 저장도 함께 되돌린다',async t=>{
  const {api,db,id}=setup(t);
  db.exec(`CREATE TRIGGER reject_revenue_audit BEFORE INSERT ON event_log
    WHEN NEW.kind='revenue.classification' BEGIN SELECT RAISE(ABORT,'audit test failure'); END`);
  await api('revenue/classifications','PUT',body(id),500);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM revenue_payment_metadata').get().n,0);
  assert.equal(db.prepare('SELECT amount FROM booking_payment_entries').get().amount,600000);
});

test('온라인 결제와 실제 부분 환불액을 분류하고 테스트 결제·취소된 수기 기록을 거절한다',async t=>{
  const {api,db,id}=setup(t);
  const insert=db.prepare(`INSERT INTO orders(oid,product_id,title,event_date,price,buyer_name,buyer_phone,data,status,booking_code,test,created_at,paid_at)
    VALUES(?,'addon-cleaning','청소 지원','2026-11-20',100000,'고객','01012345678','{}',?,'BK-TEST',?,'2026-11-18 01:00:00','2026-11-18 01:00:00')`);
  insert.run('PG-METADATA','refunded',0);
  insert.run('PG-TEST','paid',1);
  db.prepare('INSERT INTO payapp_refunds VALUES(?,?,?,?)').run('REFUND-ONE','PG-METADATA',120000,'2026-11-18 03:00:00');
  const saved=await api('revenue/classifications','PUT',body('paid:PG-METADATA',{channel:'payapp',account:'블랭크',components:[{id:'cleaning',amount:100000}]}));
  assert.equal(saved.metadata.account,'블랭크');
  const refund=await api(path('refund:REFUND-ONE'));
  assert.equal(refund.movement.amount,100000);
  await api('revenue/classifications','PUT',body('refund:REFUND-ONE',{channel:'payapp',account:'',components:[{id:'cleaning',amount:100000}]}));
  await api(path('paid:PG-TEST'),'GET',undefined,404);
  db.prepare(`INSERT INTO booking_payment_revisions(booking_code,entry_id,request_id,previous_version,action,kind,amount,note,reason,created_at)
    VALUES('BK-TEST',?,'metadata-void',0,'void','receipt',600000,'실제 입금 원본','잘못된 기록','2026-11-18 02:00:00')`).run(Number(id.slice(6)));
  await api(path(id),'GET',undefined,404);
  await api(path('entry:99999'),'GET',undefined,404);
});

test('분류 API는 관리자 인증과 같은 사이트 요청을 요구한다',async t=>{
  const {handle,env,id,api}=setup(t);
  assert.equal((await handle(new Request('https://local.test/api/admin/'+path(id)))).status,401);
  const forbidden=await handle(new Request('https://local.test/api/admin/revenue/classifications',{method:'PUT',
    headers:{'x-admin-key':env.ADMIN_KEY,origin:'https://other.test','content-type':'application/json'},body:JSON.stringify(body(id))}));
  assert.equal(forbidden.status,403);
  await api('revenue/classifications','POST',body(id),405);
  await api(path('entry:0'),'GET',undefined,400);
});

test('새 매출 분류 표가 런타임 스키마에도 포함된다',async t=>{
  const {db}=setup(t);
  const statement=SCHEMA.find(value=>value.includes('CREATE TABLE IF NOT EXISTS revenue_payment_metadata'));
  assert.ok(statement);
  db.exec('DROP TABLE revenue_payment_metadata');
  db.exec(statement);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='revenue_payment_metadata'").get());
});
