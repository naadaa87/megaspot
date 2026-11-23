import {err,now} from './_lib.js';
import {payappFeedbackConfig,validFeedback} from './_payapp.js';

const transactionNumber = value => typeof value==='string' && /^[1-9]\d{0,29}$/.test(value);
const positiveAmount = value => typeof value==='string' && /^\d{1,8}$/.test(value) && Number(value)>0;
const changes = result => Number(result?.meta?.changes??result?.changes??0);
const reservedTransaction = (merchant,number) => `
 NOT EXISTS(SELECT 1 FROM payapp_payments p WHERE p.mul_no=${number})
 AND NOT EXISTS(SELECT 1 FROM host_billing_pay_requests h WHERE h.merchant_userid=${merchant} AND h.mul_no=${number})
 AND NOT EXISTS(SELECT 1 FROM host_billing_pay h WHERE h.mul_no=${number})`;

export const depositMethodSql = booking => `(SELECT method FROM booking_deposit_methods WHERE booking_code=${booking})`;

export function depositPayappAccounts(env) {
 return [['legacy','블랭크',env.PAYAPP_USERID],['jiyu','지유공간개발',env.PAYAPP_JIYU_USERID]].flatMap(([id,label,userid])=>{
  const config=typeof userid==='string'&&payappFeedbackConfig(env,{userid:userid.trim()});
  return config?.account===id?[{id,label,userid:config.userid}]:[];
 });
}

export async function saveDepositMethod(env,b,input,amount){
 const method=input.payment_method, number=typeof input.transaction_no==='string'?input.transaction_no.trim():'';
 const account=depositPayappAccounts(env).find(x=>x.id===input.payapp_account);
 if(!['bank','card'].includes(method))return err('보증금 결제수단을 선택해 주세요.');
 if(method==='card'&&(number||input.payapp_account)){
  if(!account||!transactionNumber(number))return err('페이앱 판매자 계정과 결제요청번호를 확인해 주세요.');
  if(!Number.isSafeInteger(amount)||amount<=0)return err('등록된 보증금액을 확인해 주세요.');
  if(input.confirm_transaction!==true)return err('거래번호와 보증금액을 대조한 뒤 확인해 주세요.');
 }
 const merchant=method==='card'&&number?account.userid:null, tx=merchant?number:null, time=now();
 const code=b.booking_code;
 const update=env.DB.prepare(`
  INSERT INTO booking_deposit_methods(booking_code,method,merchant_userid,transaction_no,amount,updated_at)
  SELECT b.booking_code,?,new.merchant,new.tx,?,? FROM bookings b
  CROSS JOIN (SELECT ? AS merchant,? AS tx) new
  LEFT JOIN booking_refunds r ON r.booking_code=b.booking_code
  LEFT JOIN booking_deposit_methods old ON old.booking_code=b.booking_code
  WHERE b.booking_code=? AND b.status IN ('confirmed','completed','cancelled')
  AND COALESCE(r.state,'pending')='pending' AND COALESCE(r.revision,0)=? AND COALESCE(old.version,0)=?
  AND NOT EXISTS(SELECT 1 FROM inquiry_checks ic WHERE ic.ref=b.inquiry_ref AND COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0)<>0)
  AND NOT EXISTS(SELECT 1 FROM booking_deposit_card_cancellations e WHERE e.merchant_userid=old.merchant_userid AND e.transaction_no=old.transaction_no)
  AND (new.tx IS NULL OR (${reservedTransaction('new.merchant','new.tx')}
   AND NOT EXISTS(SELECT 1 FROM booking_deposit_methods other WHERE other.merchant_userid=new.merchant AND other.transaction_no=new.tx AND other.booking_code<>b.booking_code)))
  ON CONFLICT(booking_code) DO UPDATE SET method=excluded.method,merchant_userid=excluded.merchant_userid,
   transaction_no=excluded.transaction_no,amount=excluded.amount,version=booking_deposit_methods.version+1,updated_at=excluded.updated_at
 `).bind(method,merchant?amount:null,time,merchant,tx,code,input.revision,input.method_version);
 const [result]=await env.DB.batch([
  update,
  env.DB.prepare(`INSERT INTO event_log(kind,ref,actor,detail,created_at)
   SELECT 'deposit.method_saved',?,'admin',json_object('method',?,'payapp_linked',?),? WHERE changes()>0`).bind(code,method,merchant?1:0,time),
  env.DB.prepare("UPDATE booking_refunds SET revision=revision+1,updated_at=? WHERE booking_code=? AND changes()>0").bind(time,code)
 ]);
 return changes(result)?null:err('예약이 변경되었거나 환급 처리 중입니다. 중복 거래번호 또는 기존 이용료 결제인지도 확인해 주세요.',409,'DEPOSIT_METHOD_CONFLICT');
}

// Called only after the provider signature is verified. A seller and exact
// deposit-only transaction must be linked explicitly before events can apply.
export async function recordDepositCardCancellation(env,merchant,f){
 const partial=['70','71'].includes(f.pay_state);
 if(!partial&&!['9','64'].includes(f.pay_state))return;
 const number=partial?f.orig_mul_no:f.mul_no;
 const original=partial?f.orig_price:f.price;
 if(!transactionNumber(number)||!positiveAmount(original)||!positiveAmount(f.price)
   ||(partial&&(!transactionNumber(f.mul_no)||f.mul_no===number||Number(f.price)>Number(original))))return;
 if(f.pay_type&&!['1','4','17','23'].includes(f.pay_type)&&!(f.pay_type==='16'&&f.naverpay==='card'))return;
 const key=partial?'partial:'+f.mul_no:'full';
 const time=now();
 const sql=(q,...args)=>env.DB.prepare(q).bind(...args);
 const linked=`m.merchant_userid=? AND m.transaction_no=? AND m.method='card' AND m.amount=? AND ${reservedTransaction('m.merchant_userid','m.transaction_no')}`;
 const eligible=`NOT EXISTS(SELECT 1 FROM inquiry_checks ic WHERE ic.ref=b.inquiry_ref AND COALESCE(json_extract(ic.checks,'$.guarantee_returned'),0)<>0)`;
 const fullyCancelled=`(SELECT CASE WHEN MAX(e.cancellation_key='full')=1 THEN m.amount ELSE SUM(e.amount) END
  FROM booking_deposit_card_cancellations e WHERE e.merchant_userid=m.merchant_userid AND e.transaction_no=m.transaction_no)=m.amount`;
 const id='payapp-deposit:'+merchant+':'+number;
 const expiry=Date.now()+30*864e5;
 await env.DB.batch([
  sql(`INSERT OR IGNORE INTO booking_deposit_card_cancellations(merchant_userid,transaction_no,cancellation_key,amount,created_at)
   SELECT m.merchant_userid,m.transaction_no,?,?,? FROM booking_deposit_methods m WHERE ${linked}`,
   key,Number(f.price),time,merchant,number,Number(original)),
  sql(`INSERT OR IGNORE INTO booking_refunds(booking_code,amount,created_at,updated_at)
   SELECT m.booking_code,m.amount,?,? FROM booking_deposit_methods m JOIN bookings b USING(booking_code)
   WHERE ${linked} AND ${eligible} AND ${fullyCancelled}`,time,time,merchant,number,Number(original)),
  sql(`UPDATE booking_refunds AS r SET state='completed',completed_at=?,paid_amount=amount,deduction=0,deduction_reason='',
    deduction_notified=0,completion_id=?,account_expires_at=?,revision=revision+1,updated_at=?
   WHERE r.state='pending' AND EXISTS(SELECT 1 FROM booking_deposit_methods m JOIN bookings b USING(booking_code)
    WHERE m.booking_code=r.booking_code AND m.amount=r.amount AND ${linked} AND ${eligible} AND ${fullyCancelled})`,
   time,id,expiry,time,merchant,number,Number(original)),
  sql(`INSERT INTO event_log(kind,ref,actor,detail,created_at)
   SELECT 'deposit.card_cancelled',booking_code,'payapp',json_object('amount',paid_amount),? FROM booking_refunds
   WHERE completion_id=? AND changes()>0`,time,id)
 ]);
}

export async function depositCardFeedback(env,f){
 const config=payappFeedbackConfig(env,f);
 if(!config||!await validFeedback(config,f))return new Response('FAIL',{status:403});
 await recordDepositCardCancellation(env,config.userid,f);
 return new Response('SUCCESS');
}
