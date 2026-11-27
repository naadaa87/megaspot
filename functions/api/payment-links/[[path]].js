import {err,hasDb} from '../_lib.js';
import {paymentLinksPublic} from '../_payment_links.js';
export async function onRequest(context){
 let response;
 if(!hasDb(context.env))response=err('결제 서버를 준비 중입니다.',503);
 else try{response=await paymentLinksPublic(context);}catch{response=err('결제 링크 처리 중 오류가 발생했습니다. 결제 내역을 확인하거나 담당자에게 문의해 주세요.',500);}
 response.headers.set('referrer-policy','no-referrer');return response;
}
