import {createHmac} from 'node:crypto';
import {amanoStore} from './server.mjs';
import {notifyProblems} from './alerts.mjs';
const env=process.env,secret=env.ALIGO_RELAY_SECRET;if(String(secret||'').length<32)throw Error('Missing server authentication');
const report=process.argv.find(s=>s.startsWith('--report=')),payload={action:report?'report':'cycle',...(report?{date:report.split('=')[1]}:{}),time:Date.now()};
const body=JSON.stringify(payload);let handled=false;
try{
 const r=await fetch('http://127.0.0.1:8790/v1/amano',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',secret).update(body).digest('hex')},body,redirect:'manual',signal:AbortSignal.timeout(230000)});
 const d=await r.json();handled=d.alerts_handled===true;if(!r.ok)throw Error('Amano cycle failed HTTP '+r.status);
 console.log(JSON.stringify({ok:d.ok,operating:d.operating,processed:d.processed,waiting:d.waiting,issues:d.issues,report_status:d.report?.status}));
}catch(error){
 if(!handled){const store=amanoStore(env.AMANO_STATE_DIR||'/var/lib/megaspot-amano',secret);const active=Object.entries(store.read('operations')||{}).filter(([,e])=>!['completed','review'].includes(e.phase));const issues=active.length?active.map(([oid])=>({oid,kind:'registration',message:'서버 처리 응답을 확인하지 못했습니다. 기존 할인 이력을 확인해 주세요.'})):[{kind:'system',message:'아마노 서버 처리기에 연결하지 못했습니다. 서비스 상태를 확인해 주세요.'}];try{await notifyProblems(env,store,issues);}catch{}}
 console.error('Amano scheduled operation failed; administrator alert outcome requires review.');process.exitCode=1;
}
