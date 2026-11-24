import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {PRICING_ALL,HOLIDAYS} from '../functions/api/_catalog.js';

// 2026-11-24 반영: 12월 5·6·13·24·25·26·27·31일은 1·2호 모두 성수기 요금에서 20% 할인(천 원 단위 올림).
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function publicUi(){
 const document={body:{dataset:{}},getElementById:()=>null};
 const M={esc:v=>String(v??''),$:()=>null,$$:()=>[],CONFIG:{},fmtNum:n=>Number(n).toLocaleString('ko-KR'),imgSrc:()=>'',tagHtml:()=>''};
 const ctx=vm.createContext({window:{MEGASPOT:M},document,location:{pathname:'/spaces/megaspot-gundae/pricing/',search:''},URLSearchParams});
 for(const path of ['quote-policy','data/products','data/spaces','data/pricing-gundae','data/pricing-gundae2','data/holidays-kr','pricing-engine-v3.2','pricing-ui-v3.2','cards'])vm.runInContext(read('assets/js/'+path+'.js'),ctx);
 return {M,window:ctx.window};
}
const off=v=>Math.ceil(v*0.8/1000)*1000;
const SALE={'2026-12-05':'dec_sat','2026-12-06':'dec_sun','2026-12-13':'dec_sun','2026-12-24':'dec_sun','2026-12-25':'dec_sat','2026-12-26':'dec_sat','2026-12-27':'dec_sun','2026-12-31':'dec_sat'};
const SPACES=['megaspot-gundae','megaspot-gundae-2'];

test('12월 할인일 8일은 두 호점 모두 시간당·기본료·패키지를 20% 할인하고 천 원 단위로 올린다',()=>{
 const {M}=publicUi();
 for(const id of SPACES){
  const {D,E}=M.pricing.forSpace(id);
  for(const [date,from] of Object.entries(SALE)){
   const base=D.peak.types[from],day=E.dayInfo(date);
   assert.ok(day.peak&&day.peak.sale===20,id+' '+date);
   assert.equal(day.peak.saleFrom,from,date);
   assert.equal(day.peak.calTag,'20% 할인');
   for(const band of Object.keys(base.hourly))assert.equal(day.peak.hourly[band],off(base.hourly[band]),id+' '+date+' '+band);
   assert.equal(day.peak.surcharge,off(base.surcharge),date);
   for(const pkg of D.packages){
    assert.equal(E.pkgPrice(day,pkg),off(base.pkg[pkg.id]),id+' '+date+' '+pkg.id);
    assert.equal(E.quote({date,start:pkg.start,end:pkg.end,people:50}).total,off(base.pkg[pkg.id]));
   }
   // 시간제: 저녁 18–22시 100명 = 할인 시간당 × 4 + 할인 기본료 + 50명 × 1만 원
   assert.equal(E.quote({date,start:18,end:22,people:100}).total,off(base.hourly.evening)*4+off(base.surcharge)+500000,date);
  }
 }
});

test('할인일이 아닌 12월 날짜와 1월 요금은 그대로다',()=>{
 const {M}=publicUi();
 for(const id of SPACES){
  const {E}=M.pricing.forSpace(id);
  assert.equal(E.dayInfo('2026-12-12').peak.id,'dec_sat');
  assert.equal(E.dayInfo('2026-12-19').peak.id,'dec_sat');
  assert.equal(E.dayInfo('2026-12-20').peak.id,'dec_sun');
  assert.equal(E.dayInfo('2026-12-07').peak.id,'dec_wd');
  assert.equal(E.dayInfo('2026-12-04').peak.id,'dec_fri');
  assert.equal(E.quote({date:'2026-12-12',start:10,end:24,people:50}).total,3800000);
  assert.equal(E.quote({date:'2026-12-20',start:10,end:24,people:50}).total,2480000);
  assert.equal(E.quote({date:'2026-12-07',start:10,end:24,people:50}).total,960000);
  assert.equal(E.quote({date:'2027-01-01',start:10,end:24,people:50}).total,1690000);
  assert.equal(E.quote({date:'2027-01-02',start:10,end:24,people:50}).total,2850000);
 }
});

test('이미 발행한 종일 대관 조회 금액은 할인일에도 바뀌지 않는다',()=>{
 const {M}=publicUi();
 const before={'2026-12-05':3800000,'2026-12-06':2480000,'2026-12-13':2480000,'2026-12-26':3800000,'2026-12-27':2480000};
 for(const id of SPACES){
  const {E}=M.pricing.forSpace(id);
  for(const [date,price] of Object.entries(before)){
   assert.equal(E.pkgPrice(E.dayInfo(date),'full-day'),price,id+' '+date);
   assert.equal(E.quote({date,start:0,end:24,people:150,packageId:'full-day'}).total,price+1000000,date);
  }
  for(const date of ['2026-12-24','2026-12-25','2026-12-31'])assert.equal(E.pkgPrice(E.dayInfo(date),'full-day'),null,date);
 }
 // 서버(관리자 종일 대관 확인)도 같은 기준
 for(const id of SPACES){
  const P=PRICING_ALL[id];
  for(const [date,price] of Object.entries(before))assert.equal(P.fullDayOffer.priceOn(date,HOLIDAYS,P.peak.dates),price,id+' '+date);
 }
});

test('요금 달력과 성수기 표에 할인 표시가 나오고 서버 카탈로그도 같은 요금이다',()=>{
 const {M,window}=publicUi();
 assert.equal(JSON.stringify(PRICING_ALL),JSON.stringify(window.MEGASPOT_PRICING));
 for(const id of SPACES){
  const P=PRICING_ALL[id];
  assert.match(P.version,/v3\.3/);
  for(const [date] of Object.entries(SALE))assert.ok(P.peak.dates[date],id+' '+date);
  assert.deepEqual(P.peak.order.dec.slice(4,6),['dec_sat_sale','dec_sun_sale']);
  const {E}=M.pricing.forSpace(id);
  const cells=E.monthPrices('2026-12','allday').filter(x=>x.peak&&x.peak.calTag).map(x=>x.iso);
  assert.deepEqual(Array.from(cells),Object.keys(SALE).sort());
 }
});
