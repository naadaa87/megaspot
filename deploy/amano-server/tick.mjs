import {fallbackIssues,readRecovered} from './read-retry.mjs';
import {createHmac} from 'node:crypto';
import {amanoStore} from './server.mjs';
import {notifyProblems} from './alerts.mjs';
const env=process.env,secret=env.ALIGO_RELAY_SECRET;if(String(secret||'').length<32)throw Error('Missing server authentication');
const report=process.argv.find(s=>s.startsWith('--report=')),payload={action:report?'report':'cycle',...(report?{date:report.split('=')[1]}:{}),time:Date.now()};
const body=JSON.stringify(payload);let handled=false;
try{
 const r=await fetch('http://127.0.0.1:8790/v1/amano',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',secret).update(body).digest('hex')},body,redirect:'manual',signal:AbortSignal.timeout(230000)});
 const d=await r.json();handled=d.alerts_handled===true;if(!r.ok)throw Error('Amano cycle failed HTTP '+r.status);
 readRecovered(amanoStore(env.AMANO_STATE_DIR||'/var/lib/megaspot-amano',secret),'local-service');
 console.log(JSON.stringify({ok:d.ok,operating:d.operating,processed:d.processed,waiting:d.waiting,issues:d.issues,report_status:d.report?.status}));
}catch(error){
 if(!handled){const store=amanoStore(env.AMANO_STATE_DIR||'/var/lib/megaspot-amano',secret);const issues=fallbackIssues(store);try{await notifyProblems(env,store,issues);}catch{}}
 console.error('Amano scheduled operation failed; administrator alert outcome requires review.');process.exitCode=1;
}
