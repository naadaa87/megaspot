import {pathToFileURL} from 'node:url';
import {existsSync} from 'node:fs';
import {amanoStore} from './server.mjs';
import {parkingSite} from './site.mjs';

const delivered=s=>['delivered','sms_delivered'].includes(s);
const bad=s=>['failed','unknown','cancelled'].includes(s);
const wantedAdmins=['1886','9580'];
export function auditBatch(batch,operations={},journal={},at=Date.now(),{minVehicles=2,checkNotifications=true}={}){
 if(!batch)return {status:'no_order',batch:null};
 let pending=false;const problems=[];
 const cancelled=batch.refunded_amount>0||batch.payment_status&&batch.payment_status!=='paid';
 if(cancelled)problems.push('대상 통합 결제 취소·부분 환불 상태 확인 필요');
 if(batch.items.length<minVehicles||batch.items.reduce((n,p)=>n+p.price,0)!==batch.price)problems.push('차량별 금액·통합 결제 총액 대조 필요');
 const items=batch.items.map(p=>{
  const proof=operations[p.oid]?.verification,issues=[];
  const complete=p.status==='applied';
  if(complete){
   const hours=Number(p.hours),free=p.free_hours,paid=p.ticket==='daily'?0:hours-free;
   const expected=p.ticket==='daily'?20000:paid*3000;
   const cap=p.ticket==='daily'?20000:hours*3000;
   const steps=proof?.steps||[],freeIndex=steps.findIndex(s=>s.phase==='verified_1');
   const paidIndex=steps.findIndex(s=>/^request_(6|7|8|10)$/.test(s.phase));
   const freeFirst=free===1?freeIndex>=0&&(paidIndex<0||freeIndex<paidIndex):free===0&&proof?.free_existing===true&&p.free_external===1;
   if(!proof||!proof.free_confirmed||!proof.free_first_verified||!freeFirst||!proof.history_ids?.length||proof.entry_id!==p.entry_id||proof.date!==p.visit_date||proof.site_status!=='applied')issues.push('무료 1시간 우선 사용·아마노 할인 이력 증빙 확인 필요');
   if(![0,1].includes(free)||p.paid_hours!==paid||!Number.isSafeInteger(expected)||expected<0||expected>cap||expected>p.price||p.cost!==expected||proof?.cost!==expected)issues.push('필요 유료분·승인 한도·실제 차감액 대조 필요');
  }else if(p.status==='issue')issues.push('아마노 등록 확인 필요 상태');
  else if(p.visit_date<new Date(at+9*36e5).toISOString().slice(0,10))issues.push('이용일이 지났으나 등록 완료 미확인');
  else pending=true;
  if(p.refund_requested_at&&!p.refund_reviewed_at)issues.push('취소 문의 검토 중');
  const notices=p.customer_notifications||[],admins=p.admin_payment_sms||[];
  function check(rows,label){
   if(!rows.length||!rows.some(x=>delivered(x.status))){
    const stale=rows.some(x=>bad(x.status)||at-Date.parse(x.occurred_at.replace(' ','T')+'Z')>30*60000);
    if(stale||complete&&!rows.length)issues.push(label+' 전달 미확인');else pending=true;
   }
  }
  if(checkNotifications){
  check(notices.filter(x=>x.kind==='paid'),'고객 결제 안내');
  if(complete)check(notices.filter(x=>x.kind==='applied'),'고객 등록 완료 안내');
  for(const tail of wantedAdmins)check(admins.filter(x=>x.receiver_last4===tail),'관리자 '+tail+' 결제 문자');
  }
  const error_sms=Object.values(journal).filter(e=>e.key?.startsWith('order:'+p.oid+':')||e.key?.startsWith('balance:'+p.visit_date+':')).map(e=>({receiver_last4:e.receiver?.slice(-4),status:e.status}));
  if(p.status==='issue')for(const tail of wantedAdmins)if(!error_sms.some(e=>e.receiver_last4===tail&&e.status==='delivered')){
   issues.push('관리자 '+tail+' 오류 문자 전달 미확인');
   const recent=at-Date.parse(String(p.updated_at||'').replace(' ','T')+'Z')<30*60000;
   if(recent&&!error_sms.some(e=>e.receiver_last4===tail&&bad(e.status)))pending=true;
  }
  problems.push(...issues.map(x=>p.oid+': '+x));
  return {oid:p.oid,visit_date:p.visit_date,plate_last4:p.plate_last4,ticket:p.ticket,site_status:p.status,free_hours:p.free_hours,free_existing:proof?.free_existing??null,free_first_verified:proof?.free_first_verified===true,actual_cost:p.cost,verified_cost:proof?.cost??null,customer_notifications:notices.map(x=>({kind:x.kind,status:x.status})),admin_payment_sms:admins.map(x=>({receiver_last4:x.receiver_last4,status:x.status})),error_sms,issues};
 });
 return {status:problems.length?'attention':pending?'waiting':'verified',pending:cancelled?false:pending,batch:{oid:batch.oid,paid_at:batch.paid_at,total:batch.price,cancelled:!!cancelled,items},problems};
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
 const since=process.argv.find(x=>x.startsWith('--since='))?.slice(8),dir=process.env.AMANO_STATE_DIR||'/var/lib/megaspot-amano';
 if(!since||!existsSync(dir+'/setup-key.pem'))throw Error('Existing state and watch baseline required');
 const secret=process.env.ALIGO_RELAY_SECRET,store=amanoStore(dir,secret);
 const r=await parkingSite(secret,'audit-batch',{since});
 console.log(JSON.stringify({checked_at:new Date().toISOString(),since,...auditBatch(r.batch,store.read('operations')||{},store.read('alert-journal')||{})},null,2));
}
