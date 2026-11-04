import {createHmac} from 'node:crypto';
const secret=process.env.ALIGO_RELAY_SECRET;if(String(secret||'').length<32)throw Error('Missing server authentication');
const body=JSON.stringify({action:'cycle',time:Date.now()});
const r=await fetch('http://127.0.0.1:8790/v1/amano',{method:'POST',headers:{'Content-Type':'application/json','X-Megaspot-Signature':createHmac('sha256',secret).update(body).digest('hex')},body,redirect:'manual',signal:AbortSignal.timeout(230000)});
if(!r.ok)throw Error('Amano cycle failed HTTP '+r.status);
const d=await r.json();console.log(JSON.stringify({ok:d.ok,operating:d.operating,processed:d.processed,waiting:d.waiting,issues:d.issues}));
