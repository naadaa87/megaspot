// Calls the parking outbox once; the site keeps customer delivery disabled until verified.
import {createHmac,randomUUID} from 'node:crypto';
const secret=process.env.ALIGO_RELAY_SECRET;
if(!secret || secret.length<32)throw Error('Missing relay signature key');
const body=JSON.stringify({time:Date.now(),id:randomUUID()});
const response=await fetch('https://megaspot.kr/api/parking/notifications/tick',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',secret).update(body).digest('hex')},body,redirect:'manual',signal:AbortSignal.timeout(45000)});
if(!response.ok)throw Error('Parking notification worker returned '+response.status);
const r=await response.json();
console.log(r.enabled?'Parking notifications checked':'Parking notifications paused');
