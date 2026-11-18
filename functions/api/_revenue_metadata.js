import {err,json,now,readJson} from './_lib.js';
import {revenueMovement} from './_revenue.js';

const channels = new Set(['unknown','spacecloud','payapp','toss_terminal','bank_corporate','bank_personal']);
const itemIds = new Set(['rental','people','catering','reception','cocktail','parking','cleaning','banner','xbanner','disposable','manager','other','unclassified']);
function metadata(row,id) {
  return row ? {...row,components:row.components ? JSON.parse(row.components) : null} :
    {movement_id:id,channel:'unknown',account:'',components:null,version:0,updated_at:null};
}
function cleanComponents(value,amount) {
  if(value===null || value===undefined) return null;
  if(!Array.isArray(value) || !value.length || value.length>itemIds.size) throw Error('매출 구성 항목을 확인해 주세요.');
  let sum=0;
  const seen=new Set();
  const items=value.map(row=>{
    if(!row || !itemIds.has(row.id) || seen.has(row.id) || !Number.isSafeInteger(row.amount) || row.amount<0)
      throw Error('매출 구성은 중복 없이 0원 이상의 정수로 입력해 주세요.');
    seen.add(row.id);sum+=row.amount;
    return {id:row.id,amount:row.amount};
  });
  if(sum!==amount) throw Error('매출 구성 합계는 해당 수납·환불 금액과 같아야 합니다.');
  return items;
}

export async function revenueMetadataAdmin({env,request,url,method}) {
  if(!['GET','PUT'].includes(method)) return err('지원하지 않는 요청입니다.',405);
  let body={};
  if(method==='PUT') {
    try { body=await readJson(request,16*1024); } catch(e) { return err(e.message); }
    if(!body || typeof body!=='object' || Array.isArray(body)) return err('분류 내용을 확인해 주세요.');
  }
  const id=method==='GET' ? url.searchParams.get('movement_id') : body.movement_id;
  if(typeof id!=='string' || id.length>160 || !/^(?:entry:[1-9]\d*|(?:legacy|paid|refund|legacy-refund):[A-Za-z0-9_-]+)$/.test(id))
    return err('거래 번호를 확인해 주세요.');
  const movement=await revenueMovement(env,id);
  if(!movement || !Number.isSafeInteger(movement.amount) || movement.amount<=0)
    return err('분류할 매출 거래를 찾을 수 없습니다. 최신 내역을 다시 조회해 주세요.',404,'NOT_FOUND');
  const stored=await env.DB.prepare('SELECT * FROM revenue_payment_metadata WHERE movement_id=?').bind(id).first();
  if(method==='GET') return json({ok:true,movement:{...movement,id},metadata:metadata(stored,id)});

  if(!channels.has(body.channel)) return err('결제 채널을 확인해 주세요.');
  if(body.account!==undefined && typeof body.account!=='string') return err('계좌 구분을 확인해 주세요.');
  const account=(body.account||'').trim();
  if(account.length>80 || /[\u0000-\u001f\u007f]/.test(account)) return err('계좌 구분은 80자 이내로 입력해 주세요.');
  if(!Number.isSafeInteger(body.expected_version) || body.expected_version<0 || body.expected_version===Number.MAX_SAFE_INTEGER)
    return err('분류 버전을 확인해 주세요.');
  let components;
  try { components=cleanComponents(body.components,movement.amount); } catch(e) { return err(e.message); }
  if((stored?.version||0)!==body.expected_version) return err('다른 변경이 저장되었습니다. 최신 분류를 다시 불러와 주세요.',409,'REVENUE_METADATA_CHANGED');

  const stamp=now(), encoded=components===null ? null : JSON.stringify(components), nextVersion=body.expected_version+1;
  const write=body.expected_version===0
    ? env.DB.prepare('INSERT OR IGNORE INTO revenue_payment_metadata(movement_id,channel,account,components,version,updated_at) VALUES(?,?,?,?,1,?)')
      .bind(id,body.channel,account,encoded,stamp)
    : env.DB.prepare('UPDATE revenue_payment_metadata SET channel=?,account=?,components=?,version=version+1,updated_at=? WHERE movement_id=? AND version=?')
      .bind(body.channel,account,encoded,stamp,id,body.expected_version);
  const result=await env.DB.batch([
    write,
    env.DB.prepare("INSERT INTO event_log(kind,ref,actor,detail,created_at) SELECT 'revenue.classification',?,'admin',?,? WHERE changes()>0")
      .bind(movement.booking_code||movement.ref||id,JSON.stringify({movement_id:id,before:metadata(stored,id),after:{channel:body.channel,account,components,version:nextVersion}}),stamp)
  ]);
  const changed=result?.[0]?.meta?.changes ?? result?.[0]?.changes;
  if(changed===0) return err('다른 변경이 저장되었습니다. 최신 분류를 다시 불러와 주세요.',409,'REVENUE_METADATA_CHANGED');
  const saved=await env.DB.prepare('SELECT * FROM revenue_payment_metadata WHERE movement_id=?').bind(id).first();
  return json({ok:true,movement:{...movement,id},metadata:metadata(saved,id)});
}
