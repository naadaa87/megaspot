import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers/admin-fixture.mjs';
import {ensureSchema} from '../functions/api/_lib.js';

const second='megaspot-gundae-2',first='megaspot-gundae',date='2026-11-28',stamp='2026-11-01 03:00:00';
const path='revenue/profit?from=2026-11-01&to=2026-11-30';
const estimate=`[메가스팟 건대 2호 예상 금액] 요금표 v1.1 · 2026년 10월 23일 기준
이용일: 2026년 11월 28일(토) → 토 요금
시간: 12:00 – 18:00 (6시간)
인원: 150명 (기준 50명 + 100명)
모임: 단체 파티·기념행사
--------------------
공간료 1,065,000원
  · 낮 12:00–17:00 5시간 × 128,000원
  · 저녁 17:00–18:00 1시간 × 170,000원
  · 기본 인원 가산액(50명 포함 · 1건당) 255,000원
인원 추가 100명 × 10,000원 = 1,000,000원
뒷정리·청소 지원 1회 = 200,000원
--------------------
합계 2,265,000원 (부가세 포함)
보증금 150,000원 별도 (이용 뒤 반환)
※ 시간제 예약은 시간당 요금 × 이용 시간에 기본 인원 가산액 255,000원을 1건당 한 번 더합니다(기준 50명 포함, 인원이 적어도 같음). 패키지 금액에는 이미 들어 있습니다.`;

function setup(t) {
  t.mock.timers.enable({apis:['Date'],now:Date.parse('2026-11-19T00:00:00Z')});
  const f=fixture();t.after(()=>f.db.close());return f;
}
function booking(db,code,{amount=2265000,space=second,day=date,start=12,end=18,headcount=150,text=estimate,options={cleaning:true},data={},inquiryDay=day,inquirySpace=space}={}) {
  const ref='MS-EST-'+code;
  const saved={space_id:inquirySpace,date:inquiryDay,start_h:12,end_h:18,total:2265000,options,estimate:text,message:'PRIVATE-INQUIRY-MESSAGE',...data};
  db.prepare(`INSERT INTO inquiries(ref,space_id,status,name,event_date,data,created_at) VALUES(?,?,'예약 확정',?,?,?,?)`)
    .run(ref,inquirySpace,code,inquiryDay,JSON.stringify(saved),stamp);
  db.prepare(`INSERT INTO bookings(booking_code,inquiry_ref,space_id,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at)
    VALUES(?,?,?,?,'01012345678','5678',?,?,'confirmed',?,?,?,?)`).run(code,ref,space,code,day,headcount,amount,start,end,stamp);
  return ref;
}
const row=(report,code)=>report.items.find(item=>item.booking_code===code);

test('별도 견적이 없는 저장 계산 내역의 청소지원 20만 원에서 마진 11만 원을 적용한다',async t=>{
  const {db,api}=setup(t);booking(db,'SAVED-CLEANING');
  const report=await api(path),item=row(report,'SAVED-CLEANING'),cleaning=item.lines.find(line=>line.kind==='cleaning');
  assert.equal(item.complete,true);assert.equal(item.contractAmount,2265000);
  assert.equal(cleaning.sale,200000);assert.equal(cleaning.cost,90000);assert.equal(cleaning.profit,110000);
  assert.equal(item.serviceCost,90000);assert.equal(item.profit,2175000);
  assert.equal(item.lines.reduce((sum,line)=>sum+line.sale,0),2265000,'보증금은 예약금액과 원가에 합산하지 않는다');
  assert.equal(report.summary.unknownBookingCount,0);assert.equal(report.summary.totalCost,90000);assert.equal(report.summary.totalProfit,2175000);
  assert.equal(report.monthly[0].totalCost,90000);assert.equal(report.monthly[0].totalProfit,2175000);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE-INQUIRY-MESSAGE|\[메가스팟 건대 2호 예상 금액\]|01012345678|"estimate"/);
});

test('저장 계산의 날짜·지점·시간·총액·구성이 맞지 않으면 청소원가를 임의 확정하지 않는다',async t=>{
  const {db,api}=setup(t);
  const cases=[
    ['WRONG-DATE',{text:estimate.replace('2026년 11월 28일','2026년 11월 27일')}],
    ['WRONG-SPACE',{text:estimate.replace('건대 2호 예상 금액','건대 1호 예상 금액')}],
    ['WRONG-TIME',{start:13}],
    ['WRONG-HEADCOUNT',{headcount:149}],
    ['WRONG-INQUIRY-DATE',{inquiryDay:'2026-11-27'}],
    ['WRONG-INQUIRY-SPACE',{inquirySpace:first}],
    ['WRONG-TOTAL',{text:estimate.replace('합계 2,265,000원','합계 2,264,000원')}],
    ['WRONG-STORED-TOTAL',{data:{total:2264000}}],
    ['CHANGED-CONTRACT',{amount:2200000}],
    ['MISMATCHED-ROWS',{text:estimate.replace('지원 1회 = 200,000원','지원 1회 = 210,000원')}],
    ['INVALID-COMMA',{text:estimate.replace('지원 1회 = 200,000원','지원 1회 = 20,0000원')}],
    ['DUPLICATE-CLEANING',{text:estimate.replace('뒷정리·청소 지원 1회 = 200,000원','뒷정리·청소 지원 1회 = 100,000원\n뒷정리·청소 지원 1회 = 100,000원')}],
    ['OTHER-OPTION',{options:{cleaning:true,xbanner:true}}],
    ['OTHER-LINE',{text:estimate.replace('인원 추가 100명 × 10,000원 = 1,000,000원','바베큐 패키지 1회 = 1,000,000원')}],
    ['OTHER-SUBLINE',{text:estimate.replace('  · 낮 12:00–17:00 5시간 × 128,000원','  · 출장뷔페 패키지 50명 × 40,000원')}],
    ['UNRECOGNIZED-TEXT',{text:'청소지원 200,000원, 총액 2,265,000원'}],
    ['DISCOUNT-TEXT',{text:estimate.replace('합계 2,265,000원','요금표 기준 금액 2,365,000원\n할인 −100,000원\n합계 2,265,000원')}],
    ['VAT-UNCONFIRMED',{text:estimate.replace('(부가세 포함)','(부가세 별도)')}],
    ['DUPLICATE-TOTAL',{text:estimate.replace('합계 2,265,000원 (부가세 포함)','합계 2,265,000원 (부가세 포함)\n합계 2,265,000원 (부가세 포함)')}],
    ['CLEANING-UNDER-MARGIN',{text:estimate.replace('공간료 1,065,000원','공간료 1,165,000원').replace('지원 1회 = 200,000원','지원 1회 = 100,000원')}]
  ];
  for(const [code,options] of cases)booking(db,code,options);
  const report=await api(path);
  for(const [code] of cases){assert.equal(row(report,code).complete,false,code);assert.equal(row(report,code).serviceCost,null,code);assert.equal(row(report,code).profit,null,code);}
  assert.equal(report.summary.totalCost,null);assert.equal(report.summary.totalProfit,null);
});

test('같은 문의의 다른 날짜나 중복 행사 예약에 저장 청소금액을 옮겨 적용하지 않는다',async t=>{
  const {db,api}=setup(t),ref=booking(db,'ORIGINAL');
  db.prepare(`INSERT INTO bookings(booking_code,inquiry_ref,space_id,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at)
    VALUES('OTHER-DATE',?,?,'다른 이용일','01012345678','5678','2026-11-29',150,'confirmed',2265000,12,18,?)`).run(ref,second,stamp);
  let report=await api(path);
  assert.equal(row(report,'ORIGINAL').profit,2175000,'동일 문의라도 고유한 날짜·지점의 원래 예약은 식별한다');
  assert.equal(row(report,'OTHER-DATE').profit,null,'형제 예약의 날짜가 다르면 원가 근거를 가져오지 않는다');
  db.prepare(`INSERT INTO bookings(booking_code,inquiry_ref,space_id,customer_name,phone,phone_last4,date,headcount,status,amount,start_h,end_h,created_at)
    VALUES('DUPLICATE-EVENT',?,?,'중복 행사','01012345678','5678',?,150,'confirmed',2265000,12,18,?)`).run(ref,second,date,stamp);
  report=await api(path);
  assert.equal(row(report,'ORIGINAL').profit,null);assert.equal(row(report,'DUPLICATE-EVENT').profit,null);
});

test('저장 계산을 읽어도 포함 식음료의 미확인 원가를 대관 원가 0원으로 덮지 않는다',async t=>{
  const {db,api}=setup(t);
  const catering={status:'confirmed',course:'classic',people:50,bill_people:50,fee:100000,supply:2100000,vat:210000,total:2310000};
  booking(db,'INCLUDED-FOOD',{data:{catering,catering_in_quote:true,included_catering_amount:2310000}});
  booking(db,'AMBIGUOUS-FOOD',{data:{catering}});
  const directRef=booking(db,'DIRECT-AMBIGUOUS-FOOD');
  db.prepare(`INSERT INTO catering_orders(ref,inquiry_ref,booking_code,space_id,event_date,customer,status,total,data,created_at)
    VALUES('C-AMBIGUOUS',?,'DIRECT-AMBIGUOUS-FOOD',?,?,'직접 연결 서비스','confirmed',?,?,?)`)
    .run(directRef,second,date,catering.total,JSON.stringify(catering),stamp);
  const report=await api(path);
  for(const code of ['INCLUDED-FOOD','AMBIGUOUS-FOOD','DIRECT-AMBIGUOUS-FOOD'])assert.equal(row(report,code).profit,null,code);
});

test('별도 저장 견적이 있으면 문의 계산보다 우선하며 현재 계약과 다른 견적을 숨기지 않는다',async t=>{
  const {db,api}=setup(t),ref=booking(db,'STRUCTURED');
  const data={input:{space:second,opts:{cleaning:true}},subtotal:2265000,discount:0,
    lines:[{label:'공간료',amount:2115000},{label:'청소 지원',amount:150000}],extras:[],total:2265000};
  db.prepare('INSERT INTO quotes(quote_no,inquiry_ref,customer,event_date,total,data,created_at) VALUES(?,?,?,?,?,?,?)')
    .run('Q-STRUCTURED',ref,'구조화 견적',date,2265000,JSON.stringify(data),stamp);
  let report=await api(path);
  assert.equal(row(report,'STRUCTURED').serviceCost,40000);assert.equal(row(report,'STRUCTURED').profit,2225000);
  db.prepare('UPDATE quotes SET total=2200000 WHERE inquiry_ref=?').run(ref);
  report=await api(path);
  assert.equal(row(report,'STRUCTURED').profit,null,'이전 견적이 달라졌다고 문의 계산으로 대체해 정상 처리하지 않는다');
});

test('저장 계산 분석은 금전 원본을 수정하지 않으며 부분 수납과 환불에 독립적이다',async t=>{
  const f=setup(t);booking(f.db,'READ-ONLY');await ensureSchema(f.env);
  f.db.prepare(`INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('READ-ONLY','part-paid','receipt',400000,?)`).run(stamp);
  const tables=['bookings','inquiries','quotes','booking_payment_entries','settings','event_log'];
  const snapshot=()=>JSON.stringify(tables.map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all()]));
  const before=snapshot(),prepare=f.env.DB.prepare.bind(f.env.DB);
  f.env.DB.prepare=sql=>{assert.match(sql.trim(),/^(SELECT|WITH)\b/i);return prepare(sql);};
  const firstReport=await f.api(path);assert.equal(firstReport.summary.totalProfit,2175000);assert.equal(snapshot(),before);
  f.db.prepare(`INSERT INTO booking_payment_entries(booking_code,request_id,kind,amount,created_at) VALUES('READ-ONLY','part-refund','refund',100000,?)`).run(stamp);
  const afterRefund=snapshot(),secondReport=await f.api(path);
  assert.deepEqual(secondReport,firstReport);assert.equal(snapshot(),afterRefund);
});
