import {str} from './_lib.js';

export function foodCancellationTerms(value){
  if(value==null)return null;
  if(typeof value!=='object'||Array.isArray(value))return {error:'식음료 취소·변경 조건을 확인해 주세요.'};
  const fee=value.fee==null||value.fee===''?null:value.fee;
  if(fee!==null&&(!Number.isSafeInteger(fee)||fee<0||fee>1e9))return {error:'전체 취소 수수료를 원 단위로 확인해 주세요.'};
  const cancellation=str(value.cancellation,500),change=str(value.change,500);
  return cancellation||change||fee!==null?{fee,cancellation,change}:null;
}
