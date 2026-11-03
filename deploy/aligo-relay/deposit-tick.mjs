// Signed, single-purpose outbox tick; no customer records or secrets are logged.
import {createHmac,randomUUID} from 'node:crypto';
const secret=process.env.ALIGO_RELAY_SECRET;if(!secret||secret.length<32)throw Error('Missing relay signature key');
const readOnly=process.argv.includes('--status'),body=JSON.stringify({time:Date.now(),id:randomUUID()});
const response=await fetch('https://megaspot.kr/api/deposit-notifications/'+(readOnly?'status':'tick'),{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',secret).update(body).digest('hex')},body,redirect:'manual',signal:AbortSignal.timeout(65000)});
if(!response.ok)throw Error('Deposit notification worker returned '+response.status);
const r=await response.json();console.log(readOnly?JSON.stringify(r):r.enabled?'Deposit notifications checked':'Deposit notifications paused');
