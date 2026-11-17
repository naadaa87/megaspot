import {feedbackCustomer} from './_feedback.js';
export async function onRequest(context){try{return await feedbackCustomer(context);}catch{return new Response(JSON.stringify({ok:false,error:'설문을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'}),{status:500,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}}
