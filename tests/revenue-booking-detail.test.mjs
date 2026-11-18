import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {revenueBookingDetailAdmin} from '../functions/api/_revenue_bookings.js';
import {ensureSchema} from '../functions/api/_lib.js';
import {onRequest as middleware} from '../functions/api/_middleware.js';

const first='megaspot-gundae',second='megaspot-gundae-2',day='2026-11-20',stamp='2026-11-01 03:00:00';
const query='from=2026-11-01&to=2026-11-30',path=code=>'revenue/bookings/'+code+'?'+query;
function setup(t,{base=true}={}) {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-01T00:00:00Z')});
  const f=fixture({booking:base,date:day});t.after(()=>f.db.close());return f;
}
function booking(db,code,{date=day,space=first,name=code,status='confirmed',inquiry=null,amount=100000,legacy=0}={}) {
  db.prepare(`INSERT INTO bookings(booking_code,space_id,inquiry_ref,customer_name,phone,phone_last4,date,status,amount,start_h,end_h,headcount,memo,confirm_doc,created_at)
    VALUES(?,?,?,?,'01012345678','5678',?,?,?,13,17,25,'예약 자체 메모',?,?)`)
    .run(code,space,inquiry,name,date,status,amount,legacy?JSON.stringify({paid:legacy,updated_at:stamp,token:'PRIVATE_CONFIRMATION_TOKEN'}):null,stamp);
}
function payment(db,code,amount,kind='receipt') {
  db.prepare('INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,note,created_at) VALUES(?,?,?,?,?,?)')
    .run(code,crypto.randomUUID(),kind,amount,'PRIVATE_PAYMENT_NOTE',stamp);
}
function quote(db,id,{date=day,space=first,total=500000,lines=[],extras=[]}={}) {
  db.prepare('INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) VALUES(?,?,?,?,?,?,?)')
    .run(id,'MS-TEST','문의의 예전 이름',date,total,JSON.stringify({input:{space},subtotal:552562,discount:52562,lines,extras,secret:'PRIVATE_QUOTE_PAYLOAD'}),stamp);
}
function catering(db,id,{code=null,date=day,total=45000,summary=id}={}) {
  db.prepare(`INSERT INTO catering_orders(ref,inquiry_ref,booking_code,space_id,event_date,customer,people,status,total,data,created_at)
    VALUES(?,'MS-TEST',?,?,?,'뷔페 고객',25,'confirmed',?,?,?)`)
    .run(id,code,first,date,total,JSON.stringify({summary,vendor_phone:'PRIVATE_VENDOR_PHONE',supply:33333}),stamp);
}

test('예약 상세는 클릭한 예약의 고객·일시·연락처·공통 정산과 저장된 견적 금액을 정확히 표시한다',async t=>{
  const {db,api,data}=setup(t);booking(db,'BK-SIBLING',{date:'2026-11-21',inquiry:'MS-TEST',amount:900000});
  db.prepare('UPDATE inquiries SET event_date=?,memo=?,data=? WHERE ref=?').run('2026-11-21','문의 운영 메모',JSON.stringify({...data,
    name:'문의의 예전 이름',date:'2026-11-21',phone:'01099999999',phone2:'01088888888',org:'실제 회사',email:'saved@example.test',purpose:'행사',
    needs:['빔프로젝터','마이크'],options:{manager:{count:2,hours:3},cleaning:true,banner:false,secret:'PRIVATE_OPTION'},
    message:'고객 요청',estimate:'저장된 예상 견적',secret:'PRIVATE_INQUIRY_JSON',
    catering:{status:'confirmed',summary:'다른 날짜의 문의 뷔페',total:999999}}),'MS-TEST');
  db.prepare('INSERT INTO booking_contacts(booking_code,phone2,updated_at) VALUES(?,?,?)').run('BK-TEST','01077777777',stamp);
  payment(db,'BK-TEST',300000);payment(db,'BK-TEST',20000,'refund');
  quote(db,'Q-CORRECT',{lines:[{label:'공간 대관료',amount:300000},{label:'뒷정리·청소',amount:215041},{label:'현장 매니저',amount:7521}],
    extras:[{kind:'catering',label:'해당 예약의 저장 뷔페',amount:50000},{label:'무료 항목',amount:0},{label:'금액 미정 항목',amount:null}]});
  quote(db,'Q-WRONG-DATE',{date:'2026-11-21',total:900000,lines:[{label:'다른 날짜 견적',amount:900000}]});
  quote(db,'Q-WRONG-SPACE',{space:second,total:800000,lines:[{label:'다른 공간 견적',amount:800000}]});
  quote(db,'Q-UNDATED',{date:null,total:700000,lines:[{label:'날짜가 없는 최신 견적',amount:700000}]});
  catering(db,'C-DIRECT',{code:'BK-TEST',total:123456,summary:'명시된 예약의 뷔페'});
  catering(db,'C-SIBLING',{code:'BK-SIBLING',date:'2026-11-21',total:888888});
  catering(db,'C-INQUIRY',{date:'2026-11-21',total:999999});
  const before=(await api('revenue?'+query)).bookingSummary,changes=db.prepare('SELECT total_changes() AS n').get().n;
  const r=await api(path('BK-TEST'));
  assert.equal(r.booking.booking_code,'BK-TEST');assert.equal(r.booking.customer_name,'검증 고객');assert.equal(r.booking.date,day);
  assert.equal(r.booking.start_h,10);assert.equal(r.booking.end_h,17);assert.equal(r.booking.headcount,30);
  assert.equal(r.booking.phone,'010-1234-5678');assert.equal(r.booking.phone2,'01077777777');
  assert.equal(r.inquiry.ref,'MS-TEST');assert.equal(r.inquiry.org,'실제 회사');assert.equal(r.inquiry.memo,'문의 운영 메모');
  assert.deepEqual(r.inquiry.options,['현장 매니저 2명 × 3시간','뒷정리·청소']);assert.deepEqual(r.inquiry.needs,['빔프로젝터','마이크']);
  const list=(await api('revenue/bookings?'+query)).items.find(row=>row.booking_code==='BK-TEST');
  for(const [key,value] of Object.entries(r.settlement))assert.equal(value,list[key],key+' 상세/목록 정산 일치');
  assert.equal(r.settlement.amount,500000);assert.equal(r.settlement.netReceived,280000);assert.equal(r.settlement.balance,220000);
  assert.equal(r.quote.quote_no,'Q-CORRECT');assert.equal(r.quote.total,500000);assert.equal(r.quote.discount,52562);
  assert.deepEqual(r.quote.lines.map(line=>line.amount),[300000,215041,7521],'저장된 금액을 수납 비율이나 최신 단가로 다시 계산하지 않는다');
  assert.deepEqual(r.quote.extras.map(line=>line.amount),[50000,0,null]);
  assert.deepEqual(r.services,[{kind:'catering',label:'출장뷔페',status:'confirmed',summary:'명시된 예약의 뷔페',amount:123456}]);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE_|vendor_phone|confirm_doc|token|payment_entries/,'필요한 저장 필드만 허용하고 원문·토큰·공급업체 정보는 내보내지 않는다');
  const sibling=await api(path('BK-SIBLING'));assert.equal(sibling.booking.booking_code,'BK-SIBLING');assert.equal(sibling.quote.quote_no,'Q-WRONG-DATE');
  assert.equal(sibling.services[0].amount,888888);
  assert.deepEqual((await api('revenue?'+query)).bookingSummary,before);assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
});

test('문의 없는 예약·끊어진 문의 연결·무료·미정·초과 환불도 원본을 만들거나 보정하지 않고 조회한다',async t=>{
  const {db,api}=setup(t,{base:false});
  booking(db,'DIRECT',{legacy:150000,amount:500000,name:'직접 등록 고객'});catering(db,'C-ZERO',{code:'DIRECT',total:0,summary:'저장된 무료 뷔페'});
  booking(db,'ORPHAN',{inquiry:'MS-MISSING',amount:null,status:'completed'});payment(db,'ORPHAN',5000,'refund');
  booking(db,'FREE',{amount:0});
  const changes=db.prepare('SELECT total_changes() AS n').get().n;
  const direct=await api(path('DIRECT'));
  assert.equal(direct.inquiry,null);assert.equal(direct.quote,null);assert.equal(direct.booking.memo,'예약 자체 메모');
  assert.equal(direct.settlement.netReceived,150000);assert.equal(direct.settlement.balance,350000);
  assert.equal(direct.services[0].amount,0,'저장된 무료 서비스 0원을 미정으로 바꾸지 않는다');
  const orphan=await api(path('ORPHAN'));assert.equal(orphan.inquiry,null);assert.equal(orphan.quote,null);assert.equal(orphan.booking.status,'completed');
  assert.equal(orphan.settlement.amount,null);assert.equal(orphan.settlement.balance,null);assert.equal(orphan.settlement.excessPaid,null);
  assert.equal(orphan.settlement.netReceived,-5000);assert.equal(orphan.settlement.review_required,true);
  assert.equal((await api(path('FREE'))).settlement.amount,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM booking_payment_entries WHERE booking_code=?').get('DIRECT').n,0);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
});

test('날짜 없는 견적은 연결 예약이 하나일 때만 사용하고 다른 날짜의 형제 예약에 대신 붙이지 않는다',async t=>{
  const {db,api}=setup(t);quote(db,'Q-LEGACY',{date:null,total:500000,lines:[{label:'단일 예약의 기존 견적',amount:500000}]});
  assert.equal((await api(path('BK-TEST'))).quote.quote_no,'Q-LEGACY');
  booking(db,'BK-SIBLING',{date:'2026-11-22',inquiry:'MS-TEST'});
  assert.equal((await api(path('BK-TEST'))).quote,null);assert.equal((await api(path('BK-SIBLING'))).quote,null);
});

test('상세는 목록의 기간·지점·상태·테스트 제외와 인증을 지키며 미들웨어에서도 알림과 쓰기가 없다',async t=>{
  const {db,api,env,handle}=setup(t);await ensureSchema(env);
  for(const [code,options] of [['CANCELLED',{status:'cancelled'}],['REVIEW',{status:'payment_review'}],['OUTSIDE',{date:'2026-12-01'}],
    ['TEST-ONE',{name:'최준원'}],['TEST-TWO',{name:'　최시준\t'}]])booking(db,code,options);
  for(const code of ['CANCELLED','REVIEW','OUTSIDE','TEST-ONE','TEST-TWO','MISSING'])await api(path(code),'GET',undefined,404);
  await api(path('BK-TEST')+'&space='+second,'GET',undefined,404);
  await api(path('BK-TEST').replace('from=2026-11-01','from=2026-02-30'),'GET',undefined,400);
  await api(path('BK-TEST')+'&space=other','GET',undefined,400);
  const custom=await revenueBookingDetailAdmin({env,url:new URL('https://local.test/api/admin/'+path('TEST-ONE')),method:'GET',bookingCode:'TEST-ONE',operationalBookingSql:'1=1 OR 1=1'});
  assert.equal(custom.status,404,'명시적인 운영 조건으로도 테스트 제외를 우회할 수 없다');
  const url='https://local.test/api/admin/'+path('BK-TEST');assert.equal((await handle(new Request(url))).status,401);
  const tables=['bookings','inquiries','quotes','booking_payment_entries','settings','event_log','deposit_notifications','transaction_notifications'];
  const snapshot=()=>tables.map(table=>[table,db.prepare('SELECT * FROM '+table).all()]),before=snapshot(),changes=db.prepare('SELECT total_changes() AS n').get().n;
  const prepare=env.DB.prepare.bind(env.DB);env.DB.prepare=sql=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i,'조회 중 쓰기 금지');return prepare(sql);};
  let jobs=0;const request=new Request(url,{headers:{'x-admin-key':env.ADMIN_KEY}});
  const response=await middleware({env,request,next:()=>handle(request),waitUntil:()=>jobs++});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  await api(path('BK-TEST'),'POST',{},405);assert.equal(jobs,0);assert.deepEqual(snapshot(),before);
  assert.equal(db.prepare('SELECT total_changes() AS n').get().n,changes);
});
