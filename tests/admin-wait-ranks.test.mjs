import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture, DAY, NEXT, quoteInput} from './helpers/admin-fixture.mjs';
import {waitList} from '../functions/api/_reservation_waitlist.js';

const FIRST = 'megaspot-gundae';
const SECOND = 'megaspot-gundae-2';
const oldStamp = new Date(Date.now() - 2*864e5).toISOString();
const laterStamp = new Date(Date.now() - 864e5).toISOString();

function setup(t) {
  const f = fixture();
  t.after(() => f.db.close());
  f.db.prepare('UPDATE inquiries SET event_date=NULL').run();
  const insert = f.db.prepare(`INSERT INTO inquiries(ref,space_id,status,name,phone,event_date,headcount,data,created_at)
    VALUES(?,?,?,'검증 고객','01000000000',?,30,?,?)`);
  return {
    ...f,
    addInquiry(ref, date, {space=FIRST, data={}, status='문의 접수', created=oldStamp}={}) {
      insert.run(ref, space, status, date, JSON.stringify({date,...data}), created);
    },
    reservations(date, page=0) {
      return f.api('reservations?'+new URLSearchParams({from:date,to:date,page}));
    }
  };
}

test('관리자 날짜별 대기 순번은 전체 대기 집합에서 계산한 뒤 페이지로 자른다', async t => {
  const f = setup(t);
  const total = 1003;
  for (let i=0; i<total; i++) {
    const ref = 'MS-PAGE-'+String(i).padStart(4,'0');
    f.addInquiry(ref, DAY, {data:{wait_rank:total-i}});
  }
  f.addInquiry('MS-CANCELLED', DAY, {status:'대기 취소'});
  f.addInquiry('MS-SECOND-ROOM', DAY, {space:SECOND});

  const first = await f.reservations(DAY);
  const second = await f.reservations(DAY, 1);
  assert.equal(first.has_more, true);
  assert.deepEqual(first.items.find(item => item.ref==='MS-PAGE-0000').wait, {no:1003,total,date:DAY,space_id:FIRST});
  assert.deepEqual(second.items.find(item => item.ref==='MS-PAGE-1000').wait, {no:3,total,date:DAY,space_id:FIRST});
  assert.equal(second.items.find(item => item.ref==='MS-CANCELLED').wait, null);
  assert.deepEqual(second.items.find(item => item.ref==='MS-SECOND-ROOM').wait, {no:1,total:1,date:DAY,space_id:SECOND});
});

test('날짜·호점 변경과 복원은 대기 맨 뒤로 보내고 운영자의 재정렬은 실제 순번에 반영한다', async t => {
  const f = setup(t);
  f.addInquiry('MS-MOVED', DAY, {data:{wait_rank:1}});
  f.addInquiry('MS-DEST', NEXT, {created:laterStamp});
  f.addInquiry('MS-SECOND-ROOM', NEXT, {space:SECOND,created:laterStamp});
  const edit = {edit:true,name:'검증 고객',date:NEXT,start_h:10,end_h:17,headcount:30,amount_mode:'keep'};

  await f.api('inquiries/MS-MOVED','PATCH',edit);
  assert.deepEqual(await waitList(f.env, DAY, FIRST), []);
  assert.deepEqual(await waitList(f.env, NEXT, FIRST), ['MS-DEST','MS-MOVED']);
  await f.api('inquiries/MS-MOVED','PATCH',{...edit,space_id:SECOND});
  assert.deepEqual(await waitList(f.env, NEXT, SECOND), ['MS-SECOND-ROOM','MS-MOVED']);

  const updated = await f.api('inquiries/MS-MOVED','PATCH',{status:'조건 확인'});
  assert.deepEqual(updated.wait, {no:2,total:2,date:NEXT,space_id:SECOND});
  assert.equal((await f.api('inquiries/MS-MOVED/wait-cancel','POST',{})).wait, null);
  assert.equal((await f.api('inquiries/MS-MOVED/wait-restore','POST',{})).wait.no, 2);
  await f.api('reservations/waitlist','POST',{date:NEXT,space_id:SECOND,refs:['MS-MOVED','MS-SECOND-ROOM']});
  assert.equal((await f.reservations(NEXT)).items.find(item => item.ref==='MS-MOVED').wait.no, 1);
});

test('견적 저장으로 날짜와 호점이 바뀌어도 이전 접수 시각으로 순번을 앞당기지 않는다', async t => {
  const f = setup(t);
  f.addInquiry('MS-QUOTE', DAY, {data:{wait_rank:1}});
  f.addInquiry('MS-DEST', NEXT, {space:SECOND,created:laterStamp});
  const input = quoteInput({date:NEXT,space:SECOND,customer:'검증 고객',phone:'01000000000'});
  await f.api('quotes','POST',{
    inquiry_ref:'MS-QUOTE',customer:input.customer,event_date:NEXT,total:500000,mark_sent:true,
    data:{input,date:NEXT,lines:[{label:'공간료',desc:'',amount:500000}],range:'10:00–17:00',subtotal:500000,total:500000,deposit:150000,validUntil:NEXT}
  });
  assert.deepEqual(await waitList(f.env, DAY, FIRST), []);
  assert.deepEqual(await waitList(f.env, NEXT, SECOND), ['MS-DEST','MS-QUOTE']);
});

test('대기 취소가 먼저 저장되면 진행 중이던 확정도 예약과 달력 마감을 만들지 않는다', async t => {
  const f = setup(t);
  f.addInquiry('MS-RACE', DAY);
  const execute = f.env.DB.batch.bind(f.env.DB);
  let cancelled = false;
  f.env.DB.batch = async statements => {
    if (!cancelled) {
      cancelled = true;
      await f.api('inquiries/MS-RACE/wait-cancel','POST',{});
    }
    return execute(statements);
  };
  const result = await f.api('inquiries/MS-RACE/confirm','POST',{
    date:DAY,start_h:10,end_h:17,headcount:30,amount:300000,block_calendar:true
  },409);
  assert.equal(result.code, 'STALE');
  assert.equal(f.db.prepare("SELECT status FROM inquiries WHERE ref='MS-RACE'").get().status, '대기 취소');
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n, 0);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n, 0);
});

test('관리자도 다음 날 레거시 확정 시간과의 겹침을 표시하고 명시적 강제 확정을 유지한다', async t => {
  const f = setup(t);
  f.addInquiry('MS-NEW', DAY);
  f.addInquiry('MS-LEGACY', NEXT, {data:{start_h:6,end_h:10}});
  f.addInquiry('MS-LINKED', DAY, {data:{start_h:10,end_h:14}});
  const addBooking = f.db.prepare(`INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,headcount,status,created_at)
    VALUES(?,?,?,'검증 고객','01000000000','0000',?,30,'confirmed','fixture')`);
  addBooking.run('BK-LEGACY',FIRST,'MS-LEGACY',NEXT);
  addBooking.run('BK-LINKED',FIRST,'MS-LINKED',DAY);

  const body = {date:DAY,start_h:18,end_h:31,headcount:30,amount:300000};
  const conflict = await f.api('inquiries/MS-NEW/confirm','POST',body,409);
  assert.equal(conflict.code, 'DATE_HAS_BOOKING');
  assert.equal(conflict.bookings[0].start_h, 6);
  const confirmed = await f.api('inquiries/MS-NEW/confirm','POST',{...body,force:true});
  assert.equal(confirmed.others, 0);
  assert.equal((await f.reservations(DAY)).items.filter(item => item.kind==='pending').length, 0);
});

for (const [start_h,end_h] of [[10,17],[null,null]]) {
  const timeLabel = start_h===null?'이용 시간이 미정':'동일 시간';
  test(`${timeLabel}인 확정 요청 사이에 다른 문의가 먼저 확정되면 두 번째 쓰기를 차단한다`, async t => {
    const f = setup(t);
    f.addInquiry('MS-FIRST', DAY);
    f.addInquiry('MS-SECOND', DAY);
    const execute = f.env.DB.batch.bind(f.env.DB);
    let interleaved = false;
    const booking = {date:DAY,start_h:10,end_h:17,headcount:30,amount:300000};
    f.env.DB.batch = async statements => {
      if (!interleaved) {
        interleaved = true;
        await f.api('inquiries/MS-SECOND/confirm','POST',booking);
      }
      return execute(statements);
    };
    const result = await f.api('inquiries/MS-FIRST/confirm','POST',{...booking,start_h,end_h,block_calendar:true},409);
    assert.equal(result.code,'STALE');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='confirmed'").get().n,1);
    assert.equal(f.db.prepare("SELECT status FROM inquiries WHERE ref='MS-FIRST'").get().status,'문의 접수');
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,0);
    assert.deepEqual(await waitList(f.env,DAY,FIRST),['MS-FIRST']);

    // Manual confirmation still allows a free time when staff has put the date on hold.
    f.db.prepare("INSERT INTO calendar_blocks (space_id,date,state,memo) VALUES (?,?,'hold','직원 임시 확보')").run(FIRST,DAY);
    const after = await f.api('inquiries/MS-FIRST/confirm','POST',{...booking,start_h:18,end_h:23});
    assert.ok(after.booking_code);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='confirmed'").get().n,2);
  });
}
