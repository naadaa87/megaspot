import assert from 'node:assert/strict';
import {payappFixture} from './payapp-refund-fixture.mjs';
import {saveQuote} from './admin-fixture.mjs';
import {onRequestGet} from '../../functions/api/confirm.js';
import {confirmToken} from '../../functions/api/_confirm.js';

// The expected ledger is maintained from requested operations, independently of server totals.
export async function ledgerScenario(){
 const f=payappFixture(),pg=f.seed({price:600000}),entries=new Map(),requests=[],quotes=new Map();let fee=null,pgRefunded=0,refundNo=890000,steps=0,issued=false;
 const read=()=>f.api('bookings/BK-TEST/settlement');
 const cancellation=()=>f.api('bookings/BK-TEST/cancellation');
 const totals=()=>{let received=600000,refunded=pgRefunded;for(const e of entries.values())if(e.active){if(e.kind==='receipt')received+=e.amount;else refunded+=e.amount;}const net=received-refunded,review=net<0||received<fee;return {received,refunded,net,balance:review?null:Math.max(0,fee-net),refund_due:review?null:Math.max(0,net-fee),status:review?'payment_review':fee>net?'cancellation_receivable':net>fee?'cancellation_refund':'cancellation_settled'};};
 async function apply(op){
  const before=await read();let req;
  if(op.type==='fee'){
   const c=await cancellation(),body={mode:'manual',fee:op.amount,reason:'복합 정산 반복 검증 · 실제 예약 아님',cancelled_at:c.terms?.cancelled_at||new Date().toISOString(),request_id:crypto.randomUUID(),expected_revision:before.settlement.revision,expected_version:c.version};
   req={path:'bookings/BK-TEST/cancellation',body};await f.api(req.path,'POST',body);fee=op.amount;
   if(!issued){const fresh=await cancellation();await f.api('bookings/BK-TEST/cancellation/document','POST',{expected_version:fresh.version,expected_revision:fresh.settlement.revision});issued=true;}
  }else if(op.type==='entry'){
   assert(!entries.has(op.key));const body={kind:op.kind,amount:op.amount,note:'복합 정산 '+op.key,request_id:crypto.randomUUID(),expected_revision:before.settlement.revision};req={path:'bookings/BK-TEST/settlement',body};await f.api(req.path,'POST',body);const e=(await read()).entries.find(x=>x.request_id===body.request_id);assert(e);entries.set(op.key,{id:e.id,kind:op.kind,amount:op.amount,active:true,originalKind:op.kind,originalAmount:op.amount,request:req});
  }else if(op.type==='edit'||op.type==='void'){
   const item=entries.get(op.key);assert(item);const current=before.entries.find(e=>e.id===item.id);assert(current);const body={action:op.type==='void'?'void':'correct',kind:op.kind||item.kind,amount:op.amount??item.amount,note:'복합 정산 '+op.key,reason:'처리 내역 대조 · '+op.type,entry_version:current.version,request_id:crypto.randomUUID(),expected_revision:before.settlement.revision};req={path:'bookings/BK-TEST/settlement/entries/'+item.id,body};await f.api(req.path,'POST',body);if(op.type==='void')item.active=false;else Object.assign(item,{kind:body.kind,amount:body.amount,active:true});
  }else if(op.type==='pg_refund'){
   const body=await f.form(pg,'70',{mul_no:String(++refundNo),orig_mul_no:pg.mul_no,orig_price:'600000',price:String(op.amount)});req={pg:true,body};await f.feedback(body);pgRefunded+=op.amount;
  }else throw Error('Unsupported operation '+op.type);
  requests.push(req);steps++;return req;
 }
 async function replay(req=requests.at(-1)){
  const before=await read(),revisions=f.db.prepare('SELECT COUNT(*) n FROM booking_payment_revisions').get().n,plans=f.db.prepare('SELECT COUNT(*) n FROM booking_cancellation_revisions').get().n;
  if(req.pg)await f.feedback(req.body);else assert.equal((await f.api(req.path,'POST',req.body)).duplicate,true);
  assert.equal((await read()).settlement.revision,before.settlement.revision);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_payment_revisions').get().n,revisions);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM booking_cancellation_revisions').get().n,plans);
 }
 function expect(actual,label){const value=totals();for(const field of Object.keys(value))assert.equal(actual[field],value[field],label+' step '+steps+' '+field);assert.equal(actual.cancellation.fee,fee,label+' latest fee');}
 async function check({quote=false}={}){
  assert(fee!==null);const r=await read();expect(r.settlement,'ledger');assert.equal(r.entries.length,entries.size);assert.equal(r.settlement.pg_received,600000);assert.equal(r.settlement.pg_refunded,pgRefunded);
  for(const item of entries.values()){const actual=r.entries.find(e=>e.id===item.id);assert(actual);assert.equal(actual.amount,item.amount);assert.equal(actual.kind,item.kind);assert.equal(actual.state,item.active?'active':'void');assert.equal(actual.original_amount,item.originalAmount);assert.equal(actual.original_kind,item.originalKind);}
  const inquiry=await f.api('inquiries/MS-TEST');expect(inquiry.bookings[0].settlement,'inquiry');assert.equal(inquiry.item.status,'취소·환불');expect((await f.api('bookings')).items[0].settlement,'booking');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM calendar_blocks').get().n,0);
  const response=await onRequestGet({env:f.env,request:new Request('https://local.test/api/confirm?c=BK-TEST&k='+await confirmToken(f.env,'BK-TEST'))});assert.equal(response.status,200);const doc=(await response.json()).doc;expect(doc.settlement,'customer document');assert.equal(doc.amount,fee);assert.equal(doc.paid,totals().net);assert.equal(doc.doc_type,'cancellation');
  for(const [no,saved] of quotes)assert.equal(JSON.stringify(inquiry.quotes.find(q=>q.quote_no===no).data.settlement),saved,'old quote changed');
  if(quote){const saved=await saveQuote(f.api,{total:1000000}),all=(await f.api('inquiries/MS-TEST')).quotes,item=all.find(q=>q.quote_no===saved.quote_no);expect(item.data.settlement,'new quote');quotes.set(item.quote_no,JSON.stringify(item.data.settlement));}
  return {step:steps,fee,...totals()};
 }
 await apply({type:'entry',key:'base',kind:'receipt',amount:400000});await saveQuote(f.api,{total:1000000});
 return {f,pg,entries,requests,totals,apply,replay,check,read,cancellation,close:()=>f.db.close()};
}
export const repeatedLedgerSteps=[
 {type:'fee',amount:200000},{type:'pg_refund',amount:300000},{type:'entry',key:'refund1',kind:'refund',amount:500000},
 {type:'fee',amount:400000},{type:'entry',key:'receipt1',kind:'receipt',amount:200000},{type:'fee',amount:100000},{type:'entry',key:'refund2',kind:'refund',amount:300000},
 {type:'edit',key:'refund2',amount:200000},{type:'void',key:'receipt1'},{type:'edit',key:'receipt1',amount:150000},{type:'fee',amount:350000},
 {type:'entry',key:'receipt2',kind:'receipt',amount:200000},{type:'edit',key:'receipt2',amount:100000},{type:'void',key:'refund2'},{type:'fee',amount:250000},
 {type:'entry',key:'refund3',kind:'refund',amount:200000},{type:'edit',key:'refund3',amount:250000},{type:'fee',amount:100000},{type:'void',key:'receipt2'},{type:'edit',key:'receipt2',amount:50000},
 {type:'edit',key:'refund2',amount:50000},{type:'fee',amount:300000},{type:'pg_refund',amount:100000},{type:'entry',key:'receipt3',kind:'receipt',amount:300000},
 {type:'fee',amount:200000},{type:'entry',key:'refund4',kind:'refund',amount:100000},{type:'void',key:'refund4'},{type:'edit',key:'receipt3',amount:250000},{type:'fee',amount:150000},
 {type:'edit',key:'refund4',amount:50000},{type:'fee',amount:250000},{type:'entry',key:'receipt4',kind:'receipt',amount:50000},{type:'void',key:'refund3'},
 {type:'fee',amount:100000},{type:'entry',key:'refund5',kind:'refund',amount:400000},{type:'edit',key:'refund5',amount:350000},{type:'void',key:'receipt4'},{type:'fee',amount:300000}
];
