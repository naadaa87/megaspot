import {PRODUCTS} from './_catalog.js';
import {DEFAULT_SPACE,err,isDate,json,kstToday,SPACES} from './_lib.js';
import {refundAmountSql} from './_payapp_refund_history.js';
import {legacyPaymentSourceSql} from './_settlement.js';
import {bookingAmountSql} from './_amounts.js';

const verificationIds = PRODUCTS.items.filter(p=>p.kind==='verification').map(p=>p.id);
const spaces = [...Object.keys(SPACES),'unassigned'];
const pageSize = 50;
const operational = `NOT (b.status='cancelled' AND EXISTS (
  SELECT 1 FROM inquiries archived WHERE archived.ref=b.inquiry_ref AND archived.status='삭제됨'))`;
const categories = {rental:'대관',food:'F&B',parking:'주차',addons:'부가서비스',unclassified:'미분류'};
const components = {
  rental:['공간 대관료','rental'],people:['추가 인원·인원 가산','rental'],
  catering:['출장뷔페','food'],reception:['테이블·박스 케이터링','food'],cocktail:['출장 칵테일','food'],
  parking:['주차권','parking'],cleaning:['청소·뒷정리','addons'],manager:['현장 매니저','addons'],
  disposable:['일회용 세트','addons'],banner:['현수막','addons'],xbanner:['X배너','addons'],
  other:['기타 항목','unclassified'],unclassified:['구성 미분류','unclassified']
};
const channels = {spacecloud:'스페이스클라우드 온라인',payapp:'페이앱 온라인',toss_terminal:'토스 단말기 현장결제',
  bank_corporate:'법인계좌',bank_personal:'개인계좌',unknown:'채널 미분류'};
const totals = ()=>({count:0,received:0,refunded:0,net:0});
function add(target,kind,amount) {
  target.count++;
  target[kind==='refund'?'refunded':'received']+=amount;
  target.net=target.received-target.refunded;
}
function safe(value,fallback={}) { try { return JSON.parse(value)||fallback; } catch { return fallback; } }
const positive = n=>Number.isSafeInteger(Number(n))&&Number(n)>0?Number(n):0;

// One source for the report and classification editor; effective revisions and refund caps are shared.
function movementCtes(operationalBookingSql=operational) {
  return `online AS (
    SELECT o.oid,o.title,o.price,${refundAmountSql('o')} AS refund_total,
      COALESCE(o.paid_at,o.created_at) AS paid_at,o.paid_at IS NULL AS estimated_receipt,
      COALESCE((
        SELECT l.created_at FROM event_log l WHERE l.ref=o.oid AND
          (l.kind='order.refunded' OR (l.kind='order.updated' AND
            json_extract(CASE WHEN json_valid(l.detail) THEN l.detail END,'$.status')='refunded'))
        ORDER BY l.id DESC LIMIT 1
      ),o.updated_at,o.paid_at,o.created_at) AS legacy_refund_at,
      COALESCE(b.date,o.event_date,i.event_date) AS event_date,
      CASE WHEN o.product_id LIKE 'parking-%' THEN NULL ELSE
        COALESCE(b.space_id,i.space_id,CASE WHEN o.product_id LIKE 'pass-%' THEN '${DEFAULT_SPACE}' END) END AS space_id,
      b.booking_code,o.inquiry_ref
    FROM orders o LEFT JOIN bookings b ON b.booking_code=o.booking_code
    LEFT JOIN inquiries i ON i.ref=COALESCE(b.inquiry_ref,o.inquiry_ref)
    WHERE o.test=0 AND o.status IN ('paid','refunded') AND o.price>0
      AND o.product_id NOT IN (${verificationIds.map(()=>'?').join(',')})
      AND ${operationalBookingSql} AND (b.booking_code IS NOT NULL OR i.status IS NOT ?)
  ),refund_rows AS (
    SELECT r.mul_no,r.oid,r.amount,r.created_at,
      SUM(r.amount) OVER (PARTITION BY r.oid ORDER BY r.created_at,r.mul_no)-r.amount AS previous
    FROM payapp_refunds r JOIN online o ON o.oid=r.oid
  ),manual AS (
    SELECT booking_code,kind,amount,created_at,'entry:'||id AS id,request_id='legacy-confirmation' AS estimated
    FROM booking_payment_current WHERE state='active'
    UNION ALL
    SELECT booking_code,'receipt',amount,created_at,'legacy:'||booking_code,1 FROM (${legacyPaymentSourceSql()})
  ),movements AS (
    SELECT m.id,b.booking_code AS ref,b.booking_code,'이용료 수납·환불' AS title,b.space_id,b.date AS event_date,
      m.created_at AS occurred_at,'manual' AS source,m.kind,m.amount,m.estimated
    FROM manual m JOIN bookings b ON b.booking_code=m.booking_code WHERE ${operationalBookingSql}
    UNION ALL
    SELECT 'paid:'||oid,oid,booking_code,title,space_id,event_date,paid_at,'online','receipt',price,estimated_receipt FROM online
    UNION ALL
    SELECT 'refund:'||r.mul_no,o.oid,o.booking_code,o.title,o.space_id,o.event_date,r.created_at,
      'online','refund',MIN(r.amount,o.refund_total-r.previous),0
    FROM refund_rows r JOIN online o ON o.oid=r.oid WHERE r.previous<o.refund_total
    UNION ALL
    SELECT 'legacy-refund:'||oid,oid,booking_code,title,space_id,event_date,legacy_refund_at,'online','refund',
      refund_total-COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0),1 FROM online o
  )`;
}
export async function revenueMovement(env,movementId) {
  const row=await env.DB.prepare(`WITH ${movementCtes()}
    SELECT id AS movement_id,amount,kind,source,booking_code,ref FROM movements WHERE id=? AND amount>0`)
    .bind(...verificationIds,'삭제됨',movementId).first();
  return row||null;
}

// Largest remainders keep every allocation in whole won and preserve the movement total exactly.
function allocate(amount,rows) {
  const merged=new Map();
  for(const row of rows) {
    const id=Object.hasOwn(components,row.id)?row.id:'unclassified',weight=positive(row.amount);
    if(weight)merged.set(id,(merged.get(id)||0)+weight);
  }
  if(!merged.size)return [{id:'unclassified',amount}];
  const sum=[...merged.values()].reduce((a,b)=>a+b,0),denominator=BigInt(sum);
  const result=[...merged].map(([id,weight],index)=>{
    const value=BigInt(amount)*BigInt(weight);
    return {id,amount:Number(value/denominator),remainder:value%denominator,index};
  });
  const rest=amount-result.reduce((n,row)=>n+row.amount,0);
  const ordered=[...result].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
  for(let i=0;i<rest;i++)ordered[i].amount++;
  return result.filter(row=>row.amount>0).map(({id,amount})=>({id,amount}));
}
function componentId(row) {
  const raw=String(row.id||row.kind||row.key||'');
  if(Object.hasOwn(components,raw))return raw;
  if(raw.startsWith('pass-'))return 'rental';
  if(raw.startsWith('parking-'))return 'parking';
  if(raw.startsWith('addon-')&&Object.hasOwn(components,raw.slice(6)))return raw.slice(6);
  const label=String(row.label||'');
  if(/X\s*배너|엑스배너/i.test(label))return 'xbanner';
  if(/현수막|배너/.test(label))return 'banner';
  if(/청소|뒷정리/.test(label))return 'cleaning';
  if(/매니저/.test(label))return 'manager';
  if(/1회용|일회용|소모품/.test(label))return 'disposable';
  if(/뷔페/.test(label))return 'catering';
  if(/케이터링|리셉션/.test(label))return 'reception';
  if(/칵테일/.test(label))return 'cocktail';
  if(/주차/.test(label))return 'parking';
  if(/인원|인당/.test(label))return 'people';
  if(/공간|대관|이용권|패키지|시간 요금/.test(label))return 'rental';
  return 'unclassified';
}
function savedRows(rows) {
  return (Array.isArray(rows)?rows:[]).filter(row=>row&&positive(row.amount)).map(row=>({id:componentId(row),amount:positive(row.amount)}));
}
function quoteWeights(quote) {
  const lines=savedRows(quote.lines),extras=savedRows(quote.extras);
  if(!lines.length&&!extras.length)return [];
  const base=lines.reduce((n,row)=>n+row.amount,0),subtotal=positive(quote.subtotal);
  if(subtotal>base)lines.push({id:'unclassified',amount:subtotal-base});
  const discounted=Math.max(0,Math.max(base,subtotal)-positive(quote.discount));
  const rows=[...(discounted?allocate(discounted,lines):[]),...extras];
  const sum=rows.reduce((n,row)=>n+row.amount,0),total=positive(quote.total);
  if(total>sum)rows.push({id:'unclassified',amount:total-sum});
  // Negative extras are discounts; apply their effect to the known composition proportionally.
  return total&&total<sum?allocate(total,rows):rows;
}
function defaultWeights(row) {
  if(row.source==='online') {
    const order=safe(row.order_data),lines=savedRows(order.lines);
    if(lines.length) {
      const sum=lines.reduce((n,line)=>n+line.amount,0);
      if(row.order_price>sum)lines.push({id:'unclassified',amount:row.order_price-sum});
      return {rows:lines,basis:'주문 구성'};
    }
    const id=componentId({id:row.product_id});
    return {rows:[{id,amount:row.order_price||row.amount}],basis:id==='unclassified'?'구성 미분류':'주문 구성'};
  }
  const quote=safe(row.quote_data),weights=quoteWeights(quote);
  if(weights.length)return {rows:weights,basis:'견적 비례 배분'};
  const inquiry=safe(row.inquiry_data),contract=positive(row.booking_amount),food=[];
  for(const id of ['catering','reception','cocktail']) {
    const amount=positive(inquiry['included_'+id+'_amount']);
    if(amount)food.push({id,amount});
  }
  const foodSum=food.reduce((n,part)=>n+part.amount,0);
  if(contract&&foodSum&&foodSum<=contract) {
    if(contract>foodSum)food.push({id:'unclassified',amount:contract-foodSum});
    return {rows:food,basis:'저장 구성 비례 배분'};
  }
  return {rows:[{id:'unclassified',amount:row.amount}],basis:'구성 미분류'};
}
function merchantAccount(row,env) {
  if(!row.payapp_order)return '';
  if(!row.merchant_userid)return '블랭크';
  if(env.PAYAPP_JIYU_USERID&&row.merchant_userid===env.PAYAPP_JIYU_USERID)return '지유공간개발';
  if(env.PAYAPP_USERID&&row.merchant_userid===env.PAYAPP_USERID)return '블랭크';
  return '계정 미확인';
}
function classify(row,env) {
  const own=row.metadata_id!=null,inherit=row.inherited_id!=null;
  const channel=own?row.metadata_channel:inherit?row.inherited_channel:
    row.source==='online'&&(row.payapp_order||/^PayApp:/i.test(row.pay_method||'')||safe(row.order_data).provider==='payapp')?'payapp':'unknown';
  const account=own?row.metadata_account:inherit?row.inherited_account:channel==='payapp'?merchantAccount(row,env):'';
  const raw=own&&row.metadata_components!=null?row.metadata_components:inherit?row.inherited_components:null;
  const custom=safe(raw,[]),hasCustom=Array.isArray(custom)&&custom.length>0;
  const expected=own&&row.metadata_components!=null?row.amount:
    row.source==='online'&&row.kind==='refund'?row.order_price:row.amount;
  const stale=hasCustom&&custom.reduce((n,part)=>n+positive(part.amount),0)!==expected;
  const selected=hasCustom&&!stale?{rows:custom,basis:'직접 분류'}:defaultWeights(row);
  const parts=allocate(row.amount,selected.rows).map(part=>({...part,label:components[part.id][0],category:components[part.id][1]}));
  const {id,space_id,order_data,product_id,order_price,inquiry_data,quote_data,booking_amount,payapp_order,
    merchant_userid,pay_method,metadata_id,metadata_channel,metadata_account,metadata_components,
    inherited_id,inherited_channel,inherited_account,inherited_components,...publicRow}=row;
  return {...publicRow,movement_id:id,metadata_version:row.metadata_version||0,
    channel:Object.hasOwn(channels,channel)?channel:'unknown',account:account||'',allocation_basis:stale?'구성 재확인 필요':selected.basis,
    classification_stale:stale,
    original_amount:row.amount,all_components:parts,components:parts};
}
function classifyMovements(rows,env) {
  const result=rows.map(row=>classify(row,env)),groups=new Map();
  for(let i=0;i<rows.length;i++) {
    if(rows[i].source!=='online')continue;
    if(!groups.has(rows[i].ref))groups.set(rows[i].ref,[]);
    groups.get(rows[i].ref).push(i);
  }
  for(const indices of groups.values()) {
    const receipt=indices.find(index=>rows[index].kind==='receipt');
    if(receipt==null)continue;
    const remaining=new Map(result[receipt].components.map(part=>[part.id,part.amount]));
    const refunds=indices.filter(index=>rows[index].kind==='refund').sort((a,b)=>
      rows[a].occurred_at.localeCompare(rows[b].occurred_at)||rows[a].id.localeCompare(rows[b].id));
    for(const index of refunds) {
      const row=rows[index],item=result[index];
      // Each refund takes from the remaining original composition. Repeated rounding cannot
      // refund a component twice, and a full refund clears every component exactly.
      const ownComponents=row.metadata_id!=null&&row.metadata_components!=null&&!item.classification_stale;
      if(!ownComponents) {
        const weights=[...remaining].map(([id,amount])=>({id,amount}));
        item.components=allocate(item.amount,weights).map(part=>({...part,label:components[part.id][0],category:components[part.id][1]}));
        item.all_components=item.components;
      }
      for(const part of item.components)remaining.set(part.id,Math.max(0,(remaining.get(part.id)||0)-part.amount));
    }
  }
  return result;
}
function definitions(map) { return Object.fromEntries(Object.entries(map).map(([id,label])=>[id,{id,label,...totals()}])); }
function monthList(from,to) {
  const result=new Map(),date=new Date(from.slice(0,7)+'-01T00:00:00Z'),last=to.slice(0,7);
  while(date.toISOString().slice(0,7)<=last) {
    const month=date.toISOString().slice(0,7);
    result.set(month,{month,...totals(),branches:Object.fromEntries(spaces.map(id=>[id,totals()]))});
    date.setUTCMonth(date.getUTCMonth()+1);
  }
  return result;
}

export async function revenueAdmin({env,url,method,operationalBookingSql=operational,archivedStatus='삭제됨'}) {
  if(method!=='GET')return err('지원하지 않는 요청입니다.',405);
  const q=url.searchParams,today=kstToday(),month=today.slice(0,7),[year,monthNumber]=month.split('-').map(Number);
  const from=q.get('from')??month+'-01',to=q.get('to')??new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
  const basis=q.get('basis'),space=q.get('space')??'',day=q.get('day')??'',page=Number(q.get('page')??1);
  const channel=q.get('channel')||'',category=q.get('category')||'',component=q.get('component')||'';
  if(!isDate(from)||!isDate(to)||from>to||Date.parse(to)-Date.parse(from)>365*864e5)
    return err('조회 기간을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.');
  if(basis!==null&&basis!=='event')return err('매출은 이용일 기준으로 조회합니다. 화면을 새로고침해 주세요.');
  if((space&&!spaces.includes(space))||(day&&(!isDate(day)||day<from||day>to))||
    !Number.isSafeInteger(page)||page<1||page>100000||(channel&&!Object.hasOwn(channels,channel))||
    (category&&!Object.hasOwn(categories,category))||(component&&!Object.hasOwn(components,component)))
    return err('조회 조건을 확인해 주세요.');
  const sql=`WITH ${movementCtes(operationalBookingSql)}
    SELECT m.*,m.event_date AS day,date(m.occurred_at,'+9 hours') AS recorded_day,
      CASE WHEN m.space_id IN (?,?) THEN m.space_id ELSE 'unassigned' END AS branch,
      o.product_id,o.price AS order_price,
      json_object('lines',json_extract(o.data,'$.lines'),'provider',json_extract(o.data,'$.provider')) AS order_data,
      o.pay_method,p.oid AS payapp_order,p.merchant_userid,
      json_object('included_catering_amount',json_extract(i.data,'$.included_catering_amount'),
        'included_reception_amount',json_extract(i.data,'$.included_reception_amount'),
        'included_cocktail_amount',json_extract(i.data,'$.included_cocktail_amount')) AS inquiry_data,
      ${bookingAmountSql()} AS booking_amount,
      (SELECT json_object('lines',json_extract(q.data,'$.lines'),'extras',json_extract(q.data,'$.extras'),
        'subtotal',json_extract(q.data,'$.subtotal'),'discount',json_extract(q.data,'$.discount'),
        'total',COALESCE(json_extract(q.data,'$.total'),q.total))
        FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref AND
        (q.event_date=b.date OR (q.event_date IS NULL AND NOT EXISTS(SELECT 1 FROM bookings other
          WHERE other.inquiry_ref=b.inquiry_ref AND other.booking_code<>b.booking_code AND other.status<>'cancelled')))
        AND COALESCE(json_extract(q.data,'$.input.space'),b.space_id)=b.space_id ORDER BY q.id DESC LIMIT 1) AS quote_data,
      meta.movement_id AS metadata_id,meta.channel AS metadata_channel,meta.account AS metadata_account,
      meta.components AS metadata_components,meta.version AS metadata_version,
      inherited.movement_id AS inherited_id,inherited.channel AS inherited_channel,inherited.account AS inherited_account,
      inherited.components AS inherited_components
    FROM movements m
    LEFT JOIN orders o ON m.source='online' AND o.oid=m.ref
    LEFT JOIN payapp_payments p ON p.oid=o.oid
    LEFT JOIN bookings b ON b.booking_code=m.booking_code
    LEFT JOIN inquiries i ON i.ref=COALESCE(b.inquiry_ref,o.inquiry_ref)
    LEFT JOIN revenue_payment_metadata meta ON meta.movement_id=m.id
    LEFT JOIN revenue_payment_metadata inherited ON inherited.movement_id=CASE
      WHEN m.source='online' AND m.kind='refund' THEN 'paid:'||m.ref
      WHEN m.source='manual' AND m.estimated=1 AND m.id LIKE 'entry:%' THEN 'legacy:'||m.booking_code END
    WHERE m.amount>0 AND m.event_date BETWEEN ? AND ? ${space?'AND branch=?':''}
    ORDER BY m.event_date DESC,m.occurred_at DESC,m.id DESC`;
  const args=[...verificationIds,archivedStatus,...Object.keys(SPACES),from,to];
  if(space)args.push(space);
  const {results}=await env.DB.prepare(sql).bind(...args).all();
  const total=totals(),branches=Object.fromEntries(spaces.map(id=>[id,totals()])),daily=new Map(),monthly=monthList(from,to);
  const byCategory=definitions(categories),byChannel=definitions(channels),accounts=new Map();
  const byComponent=Object.fromEntries(Object.entries(components).map(([id,[label,category]])=>[id,{id,label,category,...totals()}]));
  const all=[];
  for(const item of classifyMovements(results||[],env)) {
    if(channel&&item.channel!==channel)continue;
    const parts=item.components.filter(part=>(!category||part.category===category)&&(!component||part.id===component));
    if(!parts.length)continue;
    item.components=parts;item.amount=parts.reduce((n,part)=>n+part.amount,0);
    const kinds=[...new Set(parts.map(part=>part.category))];item.category=kinds.length===1?kinds[0]:'mixed';
    all.push(item);
    const entry=daily.get(item.day)||{day:item.day,...totals(),branches:{}};
    if(!daily.has(item.day))daily.set(item.day,entry);
    if(!entry.branches[item.branch])entry.branches[item.branch]=totals();
    add(total,item.kind,item.amount);add(branches[item.branch],item.kind,item.amount);
    add(entry,item.kind,item.amount);add(entry.branches[item.branch],item.kind,item.amount);
    const monthEntry=monthly.get(item.day.slice(0,7));
    add(monthEntry,item.kind,item.amount);add(monthEntry.branches[item.branch],item.kind,item.amount);
    add(byChannel[item.channel],item.kind,item.amount);
    const key=JSON.stringify([item.channel,item.account]);
    if(!accounts.has(key))accounts.set(key,{channel:item.channel,account:item.account,...totals()});
    add(accounts.get(key),item.kind,item.amount);
    const categoryAmounts=new Map();
    for(const part of parts) {
      add(byComponent[part.id],item.kind,part.amount);
      categoryAmounts.set(part.category,(categoryAmounts.get(part.category)||0)+part.amount);
    }
    for(const [id,amount] of categoryAmounts)add(byCategory[id],item.kind,amount);
  }
  const withShares=rows=>rows.map(row=>({...row,share:total.received?row.received/total.received*100:0}));
  const channelRows=withShares(Object.values(byChannel)).map(row=>({...row,
    accounts:withShares([...accounts.values()].filter(account=>account.channel===row.id).map(({channel,...account})=>account))}));
  const details=day?all.filter(item=>item.day===day):all;
  let upcoming=[];
  if(!channel&&!category&&!component) {
    const upSql=`WITH ${movementCtes(operationalBookingSql)}
      SELECT b.booking_code,b.date AS day,b.space_id AS branch,b.customer_name,${bookingAmountSql()} AS amount
      FROM bookings b WHERE b.status='confirmed' AND b.date BETWEEN ? AND ? AND b.space_id IN (?,?)
      ${space?'AND b.space_id=?':''}
      AND NOT EXISTS(SELECT 1 FROM manual m WHERE m.booking_code=b.booking_code AND m.kind='receipt' AND m.amount>0)
      AND NOT EXISTS(SELECT 1 FROM online o WHERE o.booking_code=b.booking_code OR (
        o.booking_code IS NULL AND o.inquiry_ref=b.inquiry_ref AND o.space_id=b.space_id AND
        (o.event_date=b.date OR (o.event_date IS NULL AND NOT EXISTS(SELECT 1 FROM bookings other
          WHERE other.inquiry_ref=b.inquiry_ref AND other.booking_code<>b.booking_code AND other.status<>'cancelled')))))
      AND (${bookingAmountSql()} IS NULL OR ${bookingAmountSql()}>0)
      ORDER BY b.date,b.booking_code`;
    const upArgs=[...verificationIds,archivedStatus,from>today?from:today,to,...Object.keys(SPACES)];
    if(space)upArgs.push(space);
    upcoming=(await env.DB.prepare(upSql).bind(...upArgs).all()).results||[];
  }
  return json({ok:true,total,branches,daily:[...daily.values()],monthly:[...monthly.values()],
    categories:withShares(Object.values(byCategory)),components:withShares(Object.values(byComponent)),channels:channelRows,
    items:details.slice((page-1)*pageSize,page*pageSize),detailCount:details.length,page,pageSize,upcoming},200,{'cache-control':'no-store'});
}
