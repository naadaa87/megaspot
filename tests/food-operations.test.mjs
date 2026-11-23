import assert from 'node:assert/strict';
import test from 'node:test';
import { DAY, NEXT, fixture } from './helpers/admin-fixture.mjs';

const code = 'BK-TEST';
const path = 'bookings/' + code + '/food-operations';

function foodFixture(t) {
  const f = fixture({booking:true,space:'food-only'});
  t.after(() => f.db.close());
  const data = {
    ...f.data, total:500000,
    food_event:{location:'외부 행사장',start:'18:45',end:'01:30',quote_no:'Q-TEST',balance_due:DAY,reservation_fee:100000},
    catering:{course:'basic',course_name:'베이직',people:30,status:'confirmed'},
    reception:{course:'cf-manual',courseName:'직접 입력 구성',format:'box',formatName:'박스 케이터링',people:30,status:'confirmed'},
    cocktail:{cups:100,menus:['highball'],menu_names:['하이볼'],status:'confirmed'},
  };
  const update = () => f.db.prepare('UPDATE inquiries SET data=? WHERE ref=?').run(JSON.stringify(data),'MS-TEST');
  update();
  f.db.prepare('UPDATE bookings SET start_h=NULL,end_h=NULL WHERE booking_code=?').run(code);
  return {...f, data, update};
}

function operations(f, { method = 'GET', body, suffix = '', authenticated = true } = {}) {
  const url = 'https://local.test/api/admin/' + path + suffix;
  const headers = {origin:'https://local.test','content-type':'application/json'};
  if (authenticated) headers['x-admin-key'] = f.env.ADMIN_KEY;
  const request = new Request(url, {method,headers, ...(body === undefined ? {} : {body:JSON.stringify(body)})});
  return f.handle(request).then(async res => ({status:res.status,body:await res.json()}));
}

const receipt = async (f, kind, amount) => {
  const endpoint = 'bookings/' + code + '/settlement';
  const { settlement } = await f.api(endpoint);
  return f.api(endpoint,'POST',{kind,amount,note:'테스트 기록',expected_revision:settlement.revision,request_id:crypto.randomUUID()});
};

test('confirmed food operations store three onsite tasks and per-service status without changing contract or ledger', async t => {
  const f = foodFixture(t);
  const originalInquiry = f.db.prepare('SELECT data FROM inquiries').get().data;
  const originalBooking = f.db.prepare('SELECT * FROM bookings').get();
  const initial = await operations(f);
  assert.equal(initial.status,200);
  assert.equal((await operations(f,{authenticated:false})).status,401);
  assert.equal(initial.body.editable,true);
  assert.deepEqual(initial.body.orders.map(({label,people,cups}) => [label,people,cups]),[
    ['출장뷔페',30,null],['출장 케이터링',30,null],['출장 칵테일',null,100],
  ]);
  const fields = {
    version:initial.body.version, booking_revision:initial.body.booking_revision,
    schedule:{
      delivery:{date:DAY,time:'17:05',owner:'납품 A'},
      setup:{date:DAY,time:'17:50',owner:'세팅 B'},
      teardown:{date:NEXT,time:'01:45',owner:'철수 C'},
    },
    orders:{catering:'sent',reception:'confirmed',cocktail:'not_ordered'},
    checklist:{headcount:true,menu:true}, memo:'엘리베이터는 북문',
  };
  const saved = await operations(f,{method:'PUT',body:fields});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.equal(saved.body.version,1);
  assert.deepEqual(saved.body.schedule,fields.schedule);
  assert.equal(saved.body.memo,fields.memo);
  assert.deepEqual(saved.body.checklist,{headcount:'confirmed',menu:'confirmed'});
  assert.deepEqual(saved.body.orders.map(({status}) => status),['sent','confirmed','not_ordered']);
  assert.deepEqual((await operations(f)).body,saved.body);
  assert.equal(f.db.prepare('SELECT data FROM inquiries').get().data,originalInquiry);
  assert.deepEqual(f.db.prepare('SELECT * FROM bookings').get(),originalBooking);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM booking_payment_entries').get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM event_log WHERE kind='food.operations.updated'").get().n,1);
});

test('parallel saves cannot overwrite changes and schedule or menu changes require explicit review', async t => {
  const f = foodFixture(t);
  const {body:initial} = await operations(f);
  const version = {version:initial.version,booking_revision:initial.booking_revision};
  const body = {...version, schedule:{delivery:{date:DAY,time:'15:00',owner:'담당 A'}},
    orders:{catering:'confirmed'},checklist:{headcount:true,menu:true}};
  const [first,second] = await Promise.all([
    operations(f,{method:'PUT',body:{...body,memo:'작업 A'}}),
    operations(f,{method:'PUT',body:{...body,memo:'작업 B'}}),
  ]);
  assert.deepEqual([first.status,second.status].sort(),[200,409]);
  let {body:current} = await operations(f);
  assert.equal(current.version,1);
  assert.match(current.memo,/^작업 [AB]$/);
  const old = {version:current.version,booking_revision:current.booking_revision};

  f.data.food_event.start = '19:15';
  f.data.catering.course = 'special';
  f.data.catering.course_name = '스페셜';
  f.update();
  assert.equal((await operations(f,{method:'PUT',body:{...old,memo:'이전 조건'}})).body.code,'FOOD_OPERATIONS_STALE');
  ({body:current} = await operations(f));
  assert.equal(current.schedule_needs_review,true);
  assert.deepEqual(current.checklist,{headcount:'confirmed',menu:'needs_review'});
  assert.equal(current.orders[0].needs_review,true);
  const review = {
    version:current.version,booking_revision:current.booking_revision,review_schedule:true,
    orders:{catering:'sent'},checklist:{menu:true},memo:'변경 조건 확인',
  };
  const updated = await operations(f,{method:'PUT',body:review});
  assert.equal(updated.status,200);
  assert.equal(updated.body.schedule_needs_review,false);
  assert.equal(updated.body.checklist.menu,'confirmed');
  assert.equal(updated.body.orders[0].needs_review,false);

  f.data.reception.people = 34;
  f.update();
  assert.equal((await operations(f)).body.checklist.headcount,'needs_review');
  const latest = (await operations(f)).body;
  const invalid = await operations(f,{method:'PUT',body:{
    version:latest.version,booking_revision:latest.booking_revision,schedule:{teardown:{time:'02:00'}},
  }});
  assert.equal(invalid.status,400);
  assert.equal((await operations(f)).body.version,2);
});

test('manual reminder uses current balance and saved due date, and does not queue messages', async t => {
  const f = foodFixture(t);
  const reminder = () => operations(f,{suffix:'/reminder'});
  await receipt(f,'receipt',100000);
  const countReminders = () => f.db.prepare("SELECT count(*) AS n FROM transaction_notifications WHERE kind='balance_reminder'").get().n;
  let result = await reminder();
  assert.equal(result.status,200);
  assert.equal(result.body.balance,400000);
  assert.equal(result.body.due_date,DAY);
  assert.match(result.body.text,/남은 잔금 400,000원/);
  assert.match(result.body.text,new RegExp('납부일 '+DAY));
  await receipt(f,'receipt',400000);
  result = await reminder();
  assert.equal(result.body.balance,0);
  assert.equal(result.body.text,undefined);
  await receipt(f,'refund',10000);
  f.data.food_event.balance_due = '';
  f.update();
  result = await reminder();
  assert.equal(result.body.balance,10000);
  assert.doesNotMatch(result.body.text,/납부일/);
  assert.equal(countReminders(),0);

  const cancellation = await f.api('bookings/'+code+'/cancellation');
  await f.api('bookings/'+code+'/cancellation','POST',{mode:'manual',fee:100000,reason:'고객 합의',cancelled_at:new Date().toISOString(),
    request_id:crypto.randomUUID(),expected_version:cancellation.version,expected_revision:cancellation.settlement.revision});
  assert.equal((await operations(f)).body.editable,false);
  assert.equal((await operations(f,{method:'PUT',body:{}})).status,409);
  result = await reminder();
  assert.equal(result.body.text,undefined);
  assert.equal((await operations(f,{method:'POST',suffix:'/reminder'})).status,405);
  assert.equal(countReminders(),0);
});

test('a new confirmation cycle reopens checklist review and a venue booking cannot open food operations', async t => {
  const f = foodFixture(t);
  const {body:initial} = await operations(f);
  assert.equal((await operations(f,{method:'PUT',body:{
    version:initial.version,booking_revision:initial.booking_revision,
    schedule:{delivery:{date:DAY,time:'15:00',owner:'담당 A'}},
    orders:{reception:'confirmed'},checklist:{headcount:true,menu:true},
  }})).status,200);
  const base = 'bookings/' + code + '/';
  const cancellation = await f.api(base+'cancellation');
  assert.equal(cancellation.settlement.balance,500000);
  await f.api(base+'cancellation','POST',{mode:'manual',fee:0,reason:'고객 합의',cancelled_at:new Date().toISOString(),
    request_id:crypto.randomUUID(),expected_version:cancellation.version,expected_revision:cancellation.settlement.revision});
  assert.equal((await operations(f)).body.editable,false);
  let current = await f.api(base+'cancellation');
  await f.api(base+'reconfirm','POST',{request_id:crypto.randomUUID(),expected_revision:current.settlement.revision});
  current = (await operations(f)).body;
  assert.equal(current.editable,true);
  assert.equal(current.schedule_needs_review,true);
  assert.deepEqual(current.checklist,{headcount:'needs_review',menu:'needs_review'});
  assert.equal(current.orders.find(row=>row.kind==='reception').needs_review,true);

  const venue = fixture({booking:true});
  t.after(() => venue.db.close());
  assert.equal((await operations(venue)).status,404);
});
