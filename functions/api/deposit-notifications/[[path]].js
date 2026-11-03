import {err,hasDb} from '../_lib.js';
import {depositNoticeCron} from '../_deposit_notifications.js';
export async function onRequest({request,env,params}){
 if(!hasDb(env))return err('준비 중입니다.',503);
 const p=(params.path||[]).join('/');if(!['tick','status'].includes(p))return err('경로를 찾을 수 없습니다.',404);
 try{return await depositNoticeCron(request,env,p==='status');}catch{return err('알림 처리 결과를 확인해 주세요.',500);}
}
