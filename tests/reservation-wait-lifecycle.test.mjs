import test from 'node:test';
import assert from 'node:assert/strict';
import { payappFixture } from './helpers/payapp-refund-fixture.mjs';
import { onRequest as auth } from '../functions/api/auth/[[path]].js';
import { onRequest as pay, dayCol, peakOf } from '../functions/api/pay/[[path]].js';
import { onRequestGet as calendar } from '../functions/api/reservation-calendar.js';
import { onRequest as middleware } from '../functions/api/_middleware.js';
import { PRODUCTS } from '../functions/api/_catalog.js';
import { kstToday, sha256 } from '../functions/api/_lib.js';

const SPACE='megaspot-gundae';
const SPACE_TWO='megaspot-gundae-2';

function eventDate(){
  for(let n=10;n<300;n++){
    const date=kstToday(n);
    if(!peakOf(date))return date;
  }
  throw Error('No test date outside peak season');
}

function passFor(date,pkg='day'){
  return PRODUCTS.items.find(item=>item.kind==='pass'&&item.pkg===pkg&&PRODUCTS.dayGroups[item.group].cols.includes(dayCol(date))).id;
}

async function fixture(t){
  const date=eventDate(), f=payappFixture({booking:false,date});
  t.after(()=>f.db.close());
  const dbPrepare=f.env.DB.prepare;
  f.env.DB.prepare=sql=>{
    const statement=dbPrepare(sql), run=statement.run;
    statement.run=async()=>{
      const result=await run();
      return {...result,meta:{changes:result.changes}};
    };
    return statement;
  };
  let payappCalls=0;
  t.mock.method(globalThis,'fetch',async url=>{
    assert.equal(url,'https://api.payapp.kr/oapi/v2');
    payappCalls++;
    return new Response('state=1&mul_no=800101&payurl=https%3A%2F%2Fpayapp.kr%2Ffixture');
  });
  for(const id of [1,2]){
    f.db.prepare("INSERT INTO members(id,email,name,phone,pw_hash,status,agreed_at,created_at) VALUES(?,?,?,?,?,'active','fixture','fixture')")
      .run(id,'member'+id+'@example.invalid','검증 회원 '+id,'01012345678','unused');
    f.db.prepare('INSERT INTO sessions(token_hash,member_id,created_at,expires_at) VALUES(?,?,?,?)')
      .run(await sha256('lifecycle-'+id),id,'2026-01-01','2099-01-01');
  }
  f.db.prepare("UPDATE inquiries SET data=json_set(data,'$.member_id',1),created_at='2026-01-01 10:00:00' WHERE ref='MS-TEST'").run();
  function insert(ref,{id,space=SPACE,created='2026-01-01 09:00:00'}={}){
    f.db.prepare('INSERT INTO inquiries(ref,space_id,status,name,phone,event_date,headcount,data,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(ref,space,'문의 접수','가상 예약자','01012345678',date,30,JSON.stringify({member_id:id,date,start_h:10,end_h:17}),created);
  }
  async function customer(id,ref){
    const response=await auth({env:f.env,params:{path:['inquiries']},request:new Request('https://local.test/api/auth/inquiries',{headers:{cookie:'ms_session=lifecycle-'+id}})});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    return (await response.json()).items.find(item=>item.ref===ref);
  }
  async function payRequest(path,params={},data){
    const request=new Request('https://local.test/api/pay/'+path+'?'+new URLSearchParams(params),{
      method:data?'POST':'GET',headers:{origin:'https://local.test','content-type':'application/json'},
      ...(data?{body:JSON.stringify(data)}:{})
    });
    const response=await pay({request,env:f.env,params:{path:[path]}});
    return {status:response.status,body:await response.json()};
  }
  const availability=(pkg='day')=>payRequest('availability',{date,space:SPACE,product_id:passFor(date,pkg)});
  const prepare=()=>payRequest('prepare',{},{
    product_id:passFor(date),date,people:30,buyer:{name:'검증 고객',phone:'01012345678'},
    agree_terms:true,agree_privacy:true,agree_refund:true
  });
  const adminRows=async()=> (await f.api('reservations?from='+date+'&to='+date)).items;
  const confirm=ref=>f.api('inquiries/'+ref+'/confirm','POST',{date,start_h:10,end_h:17,headcount:30,amount:500000});
  const getCalendar=async()=>await (await calendar({env:f.env,request:new Request('https://local.test/api/reservation-calendar?'+new URLSearchParams({from:date,to:date}))})).json();
  return {...f,date,insert,customer,availability,prepare,adminRows,confirm,getCalendar,payappCalls:()=>payappCalls};
}

test('대기 취소·복원·확정 후 관리자와 고객 순번이 일치하고 확정 시간은 결제할 수 없다',async t=>{
  const f=await fixture(t);
  f.insert('MS-FIRST');
  f.insert('MS-THIRD',{id:2,created:'2026-01-01 11:00:00'});
  f.insert('MS-OTHER-ROOM',{space:SPACE_TWO});
  await f.api('reservations/waitlist','POST',{date:f.date,space_id:SPACE,refs:['MS-FIRST','MS-TEST','MS-THIRD']});
  async function assertRank(id,ref,no,total){
    const [rows,detail,member]=await Promise.all([f.adminRows(),f.api('inquiries/'+ref),f.customer(id,ref)]);
    const wait={no,total,date:f.date,space_id:SPACE};
    assert.deepEqual(rows.find(item=>item.kind==='pending'&&item.ref===ref).wait,wait);
    assert.deepEqual(detail.wait,wait);
    assert.deepEqual(member.wait,wait);
  }
  await assertRank(1,'MS-TEST',2,3);
  await assertRank(2,'MS-THIRD',3,3);
  await f.api('inquiries/MS-FIRST/wait-cancel','POST');
  await assertRank(1,'MS-TEST',1,2);
  assert.equal((await f.adminRows()).find(item=>item.ref==='MS-FIRST').wait,null);
  assert.equal((await f.availability()).body.pending_count,2);
  await f.api('inquiries/MS-FIRST/wait-restore','POST');
  assert.equal((await f.api('inquiries/MS-FIRST')).wait.no,3);
  const confirmed=await f.confirm('MS-TEST');
  const member=await f.customer(1,'MS-TEST');
  assert.equal(member.status,'예약 확정');
  assert.equal(member.wait,null);
  assert.equal(member.confirmed_bookings[0].code,confirmed.booking_code);
  assert.equal((await f.adminRows()).find(item=>item.ref==='MS-TEST').kind,'booking');
  await assertRank(2,'MS-THIRD',1,2);
  await f.api('inquiries/MS-FIRST/wait-cancel','POST');
  assert.equal((await f.prepare()).body.code,'RESERVATION_PENDING');
  await f.api('inquiries/MS-THIRD/wait-cancel','POST');
  assert.equal((await f.customer(2,'MS-THIRD')).wait,null);
  const occupied=(await f.availability()).body;
  assert.equal(occupied.pending_count,0);
  assert.equal(occupied.slot_blocked,true);
  assert.equal((await f.prepare()).body.code,'DATE_TAKEN');
  assert.equal((await f.availability('allnight')).body.slot_blocked,false);
  assert.equal(f.payappCalls(),0);
  const schedule=await f.getCalendar();
  assert.deepEqual(schedule.pendingDates,[{space:SPACE_TWO,date:f.date,count:1,next_wait_no:2}]);
  assert.equal(schedule.intervals[0].start,f.date+'T10:00:00+09:00');
});

test('확정 예약 없이 마지막 대기가 취소되면 결제를 열고 대기 복원 시 다시 막는다',async t=>{
  const f=await fixture(t);
  assert.equal((await f.availability()).body.payment_blocked,true);
  await f.api('inquiries/MS-TEST/wait-cancel','POST');
  const customer=await f.customer(1,'MS-TEST');
  assert.equal(customer.status,'대기 취소');
  assert.equal(customer.wait,null);
  const available=(await f.availability()).body;
  assert.equal(available.pending_count,0);
  assert.equal(available.payment_blocked,false);
  assert.equal(available.slot_blocked,false);
  assert.equal((await f.prepare()).status,200);
  assert.equal(f.payappCalls(),1);
  await f.api('inquiries/MS-TEST/wait-restore','POST');
  assert.equal((await f.customer(1,'MS-TEST')).wait.no,1);
  assert.equal((await f.prepare()).body.code,'RESERVATION_PENDING');
  assert.equal(f.payappCalls(),1);
});

test('고객 문의 현황 새로고침은 자동 발송을 실행하지 않는다',async t=>{
  const f=await fixture(t), jobs=[];
  for(const path of ['/api/auth/inquiries','/api/auth/inquiries/']){
    const request=new Request('https://local.test'+path,{headers:{cookie:'ms_session=lifecycle-1'}});
    const response=await middleware({env:f.env,request,waitUntil:p=>jobs.push(p),next:()=>auth({env:f.env,request,params:{path:['inquiries']}})});
    assert.equal(response.status,200);
  }
  assert.equal(jobs.length,0);
  assert.equal(f.payappCalls(),0);
});

test('확정이 조회와 동시에 일어나도 마이페이지의 예약 상태와 순번은 한 시점의 값이다',async t=>{
  const f=await fixture(t);
  const prepare=f.env.DB.prepare;
  let confirmed=false;
  f.env.DB.prepare=sql=>{
    const statement=prepare(sql), all=statement.all;
    if(sql.includes("$.member_id")&&sql.includes('LIMIT 100')){
      statement.all=async()=>{
        const snapshot=await all();
        if(!confirmed){
          confirmed=true;
          await f.confirm('MS-TEST');
        }
        return snapshot;
      };
    }
    return statement;
  };
  const before=await f.customer(1,'MS-TEST');
  assert.equal(before.status,'문의 접수');
  assert.equal(before.wait.no,1);
  assert.deepEqual(before.confirmed_bookings,[]);
  const after=await f.customer(1,'MS-TEST');
  assert.equal(after.status,'예약 확정');
  assert.equal(after.wait,null);
  assert.equal(after.confirmed_bookings.length,1);
});
