import {json,err,readJson} from './_lib.js';
import {parkingSign} from './_parking_notifications.js';
const RELAY='https://relay.naranhistory.com/megaspot/amano';
export async function amanoAdmin(request,env,path){
 let action,data={};
 if(path==='admin/amano/status'&&request.method==='GET')action='status';
 else if(path==='admin/amano/setup'&&request.method==='POST'){
  action='setup';const d=await readJson(request);
  if(d.confirm_storage!==true||typeof d.encrypted_credentials!=='string'||d.encrypted_credentials.length>2000)return err('계정 암호화와 서버 보관 동의를 확인해 주세요.');
  data={encrypted_credentials:d.encrypted_credentials,confirm_storage:true};
 }else if(path==='admin/amano/check'&&request.method==='POST')action='check';
 else return err('경로를 찾을 수 없습니다.',404);
 if(String(env.ALIGO_RELAY_SECRET||'').length<32)return err('기존 서버 연결 설정을 확인해 주세요.',503);
 const body=JSON.stringify({action,...data,time:Date.now()});
 try{const r=await fetch(RELAY,{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':await parkingSign(env.ALIGO_RELAY_SECRET,body)},body,redirect:'manual',signal:AbortSignal.timeout(25000)});if(r.status>=300&&r.status<400)return err('서버 주소를 확인해 주세요.',502);const d=await r.json();return json(d,r.status);}catch{return err('아마노 서버 연결을 확인해 주세요.',502);}
}
