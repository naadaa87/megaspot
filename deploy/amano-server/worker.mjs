import {DISCOUNTS,plateParts} from './client.mjs';
const codes=n=>({1:'6',2:'7',3:'8'})[n];
function assertEntry(d,p,e){if(d.entry.id!==e.id||!plateParts(d.entry.plate).includes(p.plate)||d.entry.entryAt.slice(0,10)!==p.visit_date||d.entry.entryAt.slice(0,16)!==e.entryAt.slice(0,16)||d.entry.cardType!==e.cardType||d.entry.out||e.out)throw Error('입차ID·전체 차량번호·입차시각 대조 필요');}
export function freeCount(d){
 let count=0;for(const h of d.discounts){if(h.code==='1'){if(h.name!=='1시간할인'||h.price!==0||h.minutes!==60||h.entryId!==d.entry.id)throw Error('무료 1시간 이력 확인 필요');count++;}else if(h.price===0)throw Error('다른 무료 할인 이력 확인 필요');}
 if(count>1)throw Error('무료 1시간 중복 이력 확인 필요');return count;
}
export function plan(d,p){
 const free=freeCount(d)===0,paid=p.ticket==='daily'?null:Number(p.hours)-(free?1:0),code=p.ticket==='daily'?'10':paid?codes(paid):null;
 if(p.ticket!=='daily'&&(![1,2,3].includes(Number(p.hours))||paid<0||paid>3)||code===undefined)throw Error('주차권 등록 구성 확인 필요');
 for(const id of ['1',...(code?[code]:[])]){const expected=DISCOUNTS[id],t=d.types.find(t=>t.id===id);if(!t||t.name!==expected.name||t.price!==expected.price||t.minutes!==expected.minutes)throw Error('할인 코드·가격·시간 변경 확인 필요');}
 const cost=code?DISCOUNTS[code].price:0,cap=p.ticket==='daily'?20000:Number(p.hours)*3000;
 if(cost>cap||cost>p.price||d.balance<cost)throw Error('승인 원가 한도 또는 선충전 잔액 확인 필요');
 if(d.discounts.some(h=>h.memo===p.oid))throw Error('같은 주문의 아마노 할인 이력 존재 · 중복 방지 확인 필요');
 return {free,paid,code,cost};
}
function sameHistory(a,b){const ids=d=>d.discounts.map(x=>x.id).sort().join(',');return ids(a)===ids(b)&&a.balance===b.balance;}
function paid(p){if(p.payment_status!=='paid'||p.refunded_amount||p.refund_pending||p.status!=='processing')throw Error('결제·환불·처리 상태 변경');}
export async function runCycle({site,client,store,maxOrders=10,now=()=>Date.now(),isEnabled=()=>true}){
 const started=now(),feed=await site('orders'),summary={ok:true,operating:!!feed.operating,started_at:new Date(started).toISOString(),processed:0,waiting:0,issues:[],checked:0};
 if(!feed.operating){store.save('last-run',summary);return summary;}
 const ledger=store.read('operations')||{};
 const save=(oid,phase,extra={})=>{ledger[oid]={...ledger[oid],...extra,phase,updated_at:new Date(now()).toISOString()};store.save('operations',ledger);};
 const issue=async(oid,message)=>{summary.issues.push({oid,message});save(oid,'review',{message});try{await site('issue',{oid,data:{memo:message}});}catch{}};
 for(const [oid,r] of Object.entries(ledger)){if(['completed','review'].includes(r.phase))continue;try{const q=(await site('order',{oid})).order;if(q.status==='applied'){save(oid,'completed');continue;}}catch{}await issue(oid,'이전 서버 처리 결과 확인 필요 · 자동 재등록 중지');}
 const orders=feed.items.slice(0,maxOrders);if(orders.length)await client.login();
 for(const p of orders){
  if(now()-started>180000)break;summary.checked++;
  if(ledger[p.oid]){if(ledger[p.oid].phase!=='completed')summary.issues.push({oid:p.oid,message:'기존 처리 결과 확인 필요'});continue;}
  let locked=false;
  try{
   const matches=await client.entries(p.plate,p.visit_date);if(!matches.length){summary.waiting++;continue;}if(matches.length!==1)throw Error('동일 차량의 입차 건이 여러 개입니다.');
   const e=matches[0];let d=await client.detail(e,p.visit_date);assertEntry(d,p,e);const wanted=plan(d,p);
   save(p.oid,'claim_requested',{entry_id:e.id,cost:wanted.cost});
   await site('claim',{oid:p.oid,data:{entry_id:e.id,entry_at:e.entryAt.slice(0,16),plate_confirm:p.plate,confirm_entry:true,free_used:!wanted.free,confirm_no_free:wanted.free,memo:'입차·기존 무료 할인 이력 대조 완료'}});locked=true;
   let q=(await site('order',{oid:p.oid})).order;paid(q);
   if(q.entry_id!==e.id||q.free_hours!==Number(wanted.free)||p.ticket!=='daily'&&q.paid_hours!==wanted.paid)throw Error('무료 1시간 배정과 아마노 이력 불일치');
   save(p.oid,'claimed');
   const apply=async(code)=>{
    if(!isEnabled())throw Error('관리자가 서버 자동 처리를 중지했습니다.');
    paid((await site('order',{oid:p.oid})).order);
    const before=await client.detail(e,p.visit_date);assertEntry(before,p,e);if(!sameHistory(d,before))throw Error('다른 등록 또는 잔액 변경 감지');
    const expectedType=DISCOUNTS[code],actualType=before.types.find(t=>t.id===code);if(!actualType||actualType.price!==expectedType.price||actualType.minutes!==expectedType.minutes||actualType.name!==expectedType.name||before.balance<expectedType.price)throw Error('등록 직전 할인 가격·잔액 변경 확인 필요');
    save(p.oid,'request_'+code,{code,balance_before:before.balance,history_before:before.discounts.map(h=>h.id)});
    await client.register(e,code,p.oid);
    const after=await client.detail(e,p.visit_date);assertEntry(after,p,e);
    const old=new Set(before.discounts.map(h=>h.id)),added=after.discounts.filter(h=>!old.has(h.id)),expected=DISCOUNTS[code];
    if(added.length!==1||added[0].code!==code||added[0].memo!==p.oid||added[0].account!==client.credentials.username||added[0].entryId!==e.id||added[0].price!==expected.price||added[0].charged!==expected.price||before.balance-after.balance!==expected.price)throw Error('아마노 등록 결과·차감액 확인 필요 · 재등록 중지');
    d=after;save(p.oid,'verified_'+code,{verified_history:after.discounts.map(h=>h.id),balance_after:after.balance});
   };
   if(wanted.free)await apply('1');
   if(freeCount(d)!==1)throw Error('무료 1시간 우선 등록 미확인');
   if(wanted.code)await apply(wanted.code);
   save(p.oid,'verified',{cost:wanted.cost});
   await site('complete',{oid:p.oid,data:{cost:wanted.cost,confirm_free_applied:true,confirm_paid_applied:true,memo:'아마노 입차ID '+e.id+' · 무료 1시간 선사용 확인 · 할인내역 '+d.discounts.map(h=>h.id).join(',')+' · 실제 차감 '+wanted.cost+'원'}});
   save(p.oid,'completed');summary.processed++;
  }catch(error){const message=String(error?.message||'서버 처리 확인 필요').slice(0,180);await issue(p.oid,(locked?'등록 처리 중 · ':'등록 전 확인 · ')+message);}
 }
 summary.finished_at=new Date(now()).toISOString();store.save('last-run',summary);return summary;
}
