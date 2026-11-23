import {err,json} from './_lib.js';
import {revenueBookingCohort,revenueBookingScope} from './_revenue_bookings.js';
import {readCocktailPricing,cocktailPricing} from './_cocktail_pricing.js';
import {FOOD_SPACE} from './_food_booking.js';
import {savedCleaningEstimateQuote} from './_revenue_estimate.js';

const names={rental:'공간 대관·인원',catering:'출장뷔페',reception:'테이블·박스 케이터링',cocktail:'출장 칵테일',cleaning:'청소 지원',manager:'현장 매니저',banner:'현수막',other:'기타·확인 필요'};
const foodKinds=['catering','reception','cocktail'];
const valueCourses=new Set(['cf-value-10000','cf-value-15000','cf-value-20000']);
const money=value=>value==null||value===''||!Number.isSafeInteger(Number(value))||Number(value)<0?null:Number(value);
const parse=value=>{if(value&&typeof value==='object')return value;try{return JSON.parse(value||'null');}catch{return null;}};
const issue=(code,message)=>({code,message});
const selected=value=>value===true||value===1||(value&&typeof value==='object'&&value.on!==false&&value.on!==0);

export function profitPolicy(config) {
  return {version:'20261118-margin-v1',label:'현재 운영 마진 기준 예상이익',vatBasis:'included',vatLabel:'부가세 포함 기준',
    bartenderTreatment:'retained',bartenderLabel:'바텐더 출장·제조비도 이익에 포함',
    scopeNote:'확정·이용 완료 예약금액에서 서비스 예상원가를 차감합니다. 임대료·고정 인건비·결제수수료 등은 포함하지 않으며 실제 과거 매입원가가 아닙니다.',
    rules:[{kind:'rental',label:names.rental,description:'대관·인원 원가 0원'},
      {kind:'catering',label:names.catering,description:'계산 인원 1인당 10,000원 + 저장된 출장·세팅비에서 최대 100,000원 마진 (부가세 별도)'},
      {kind:'reception',label:names.reception,description:'일반 코스 1인당 5,000원 마진, 실속 A·B·C 음식 판매가의 30% 마진. 배송·세팅비 마진 0원 (부가세 별도)'},
      {kind:'cleaning',label:names.cleaning,description:'저장된 판매금액에서 110,000원 마진 (부가세 포함)'},
      {kind:'manager',label:names.manager,description:'저장된 인원 × 시간당 10,000원 마진 (부가세 포함)'},
      {kind:'banner',label:names.banner,description:'저장된 현수막 1건당 40,000원 마진 (부가세 포함)'},
      {kind:'cocktail',label:names.cocktail,description:'현재 패키지 공급가를 예상원가로 적용하며 바텐더 출장·제조비 원가 0원'}],
    cocktailRevision:config?.revision||0,cocktailTable:cocktailPricing(config).map(({cups,sale_price,vendor_supply,bartender_fee,margin})=>({cups,sale_price,vendor_supply,bartender_fee,margin}))};
}

const serviceFields=['status','removed','course','people','bill_people','total','supply','vat','fee','food','vat_excluded','price','cups','bartender_fee','subtotal','include_in_booking','included_amount','bbq','beer','soju'];
const safeSql=expr=>`CASE WHEN json_valid(${expr}) THEN ${expr} ELSE '{}' END`;
const fieldsSql=(expr,fields)=>`json_object(${fields.flatMap(key=>[`'${key}'`,`json_extract(${expr},'$.${key}')`]).join(',')})`;
const serviceSql=(expr,kind)=>`CASE WHEN json_type(${expr},'$.${kind}')='object' THEN ${fieldsSql(`json_extract(${expr},'$.${kind}')`,serviceFields)} END`;
const projectedLines=expr=>`(SELECT json_group_array(json_object('label',json_extract(line.value,'$.label'),'amount',json_extract(line.value,'$.amount')))
  FROM json_each(${expr},'$.lines') line)`;
const projectedExtras=expr=>`(SELECT json_group_array(json_object('label',json_extract(extra.value,'$.label'),'kind',json_extract(extra.value,'$.kind'),
  'amount',json_extract(extra.value,'$.amount'),${foodKinds.flatMap(kind=>[`'${kind}'`,serviceSql('extra.value',kind)]).join(',')})) FROM json_each(${expr},'$.extras') extra)`;

// One projected context query per 90 reservations. No current selling price is used
// to reconstruct saved sales. Only the generated pricing estimate is projected;
// customer messages and contact fields never enter this cost model.
export async function profitSourcesFor(env,codes) {
  const out={};
  for(let offset=0;offset<codes.length;offset+=90) {
    const batch=codes.slice(offset,offset+90),idata=safeSql('i.data'),qdata=safeSql('q.data'),cdata=safeSql('co.data');
    const {results}=await env.DB.prepare(`SELECT b.booking_code,b.inquiry_ref,b.headcount AS booking_headcount,i.event_date AS inquiry_date,i.space_id AS inquiry_space,
      (SELECT COUNT(*) FROM bookings other WHERE other.inquiry_ref=b.inquiry_ref AND other.status<>'cancelled') AS sibling_count,
      (SELECT COUNT(*) FROM bookings other WHERE other.inquiry_ref=b.inquiry_ref AND other.status<>'cancelled' AND other.date=b.date AND other.space_id=b.space_id) AS event_sibling_count,
      json_object(${foodKinds.flatMap(kind=>[`'${kind}'`,serviceSql(idata,kind),`'included_${kind}_amount'`,`json_extract(${idata},'$.included_${kind}_amount')`,`'${kind}_in_quote'`,`json_extract(${idata},'$.${kind}_in_quote')`]).join(',')},'options',json_extract(${idata},'$.options'),
        'estimate',json_extract(${idata},'$.estimate'),'total',json_extract(${idata},'$.total')) AS inquiry_data,
      (SELECT json_object('total',q.total,'subtotal',json_extract(${qdata},'$.subtotal'),'discount',json_extract(${qdata},'$.discount'),
        'lines',${projectedLines(qdata)},'extras',${projectedExtras(qdata)},'options',json_extract(${qdata},'$.input.opts'))
       FROM quotes q WHERE q.inquiry_ref=b.inquiry_ref AND (q.event_date=b.date OR (q.event_date IS NULL AND NOT EXISTS
         (SELECT 1 FROM bookings other WHERE other.inquiry_ref=b.inquiry_ref AND other.booking_code<>b.booking_code AND other.status<>'cancelled')))
       AND COALESCE(json_extract(${qdata},'$.input.space'),b.space_id)=b.space_id ORDER BY q.id DESC LIMIT 1) AS quote_data,
      (SELECT json_object('status',co.status,'total',co.total,'data',${fieldsSql(cdata,serviceFields)}) FROM catering_orders co
       WHERE co.booking_code=b.booking_code OR (COALESCE(co.booking_code,'')='' AND co.inquiry_ref=b.inquiry_ref AND co.event_date=b.date AND co.space_id=b.space_id)
       ORDER BY CASE WHEN co.booking_code=b.booking_code THEN 0 ELSE 1 END,co.id DESC LIMIT 1) AS catering_data
      FROM bookings b LEFT JOIN inquiries i ON i.ref=b.inquiry_ref WHERE b.booking_code IN (${batch.map(()=>'?').join(',')})`)
      .bind(...batch).all();
    for(const row of results||[])out[row.booking_code]={...row,inquiry_data:parse(row.inquiry_data)||{},quote_data:parse(row.quote_data),catering_data:parse(row.catering_data)};
  }
  return out;
}

function kindOf(line) {
  if(foodKinds.includes(line.kind))return line.kind;
  const label=String(line.label||'');
  if(/뷔페/.test(label))return 'catering';if(/칵테일/.test(label))return 'cocktail';if(/케이터링|리셉션|실속 [ABC]/.test(label))return 'reception';
  if(/X\s*배너|엑스배너/i.test(label))return 'other';
  if(/청소|뒷정리/.test(label))return 'cleaning';if(/매니저/.test(label))return 'manager';if(/현수막|배너/.test(label))return 'banner';
  if(/바베큐|생맥주|소주|주류|다과|도시락|샌드위치|핑거푸드|식음료/.test(label))return 'other';
  if(/주차|일회용|1회용|소모품/.test(label))return 'other';
  return /공간|대관|인원|인당|이용권|시간 요금|패키지/.test(label)?'rental':'other';
}
function taxSale(kind,snapshot) {
  const total=money(snapshot?.total),vat=money(snapshot?.vat);
  let supply=money(kind==='cocktail'?snapshot?.subtotal:snapshot?.supply);
  if(kind==='cocktail'&&supply==null&&money(snapshot?.price)!=null&&money(snapshot?.bartender_fee)!=null)supply=Number(snapshot.price)+Number(snapshot.bartender_fee);
  if(!snapshot||total==null||supply==null||vat==null||supply+vat!==total||vat!==Math.round(supply/10)||
    (kind!=='catering'&&snapshot.vat_excluded!==true&&snapshot.vat_excluded!==1))return null;
  return {total,supply,vat};
}
function serviceLine(kind,sale,snapshot,policy) {
  const line={kind,label:names[kind],sale,cost:null,profit:null,basis:'현재 운영 마진 모형 · 부가세 포함',quantity:null,reasons:[]};
  if(!snapshot||snapshot.removed||snapshot.status==='cancelled')line.reasons.push(issue('service_snapshot_missing','이 계약에 포함된 유효한 저장 서비스 구성이 필요합니다.'));
  const tax=taxSale(kind,snapshot);if(!tax)line.reasons.push(issue('service_tax_unknown','저장된 서비스 판매가·공급가액·부가세 기준을 확인해야 합니다.'));
  let costEx=null;
  if(kind==='catering') {
    line.quantity=money(snapshot?.bill_people);
    const fee=money(snapshot?.fee);
    if(!line.quantity)line.reasons.push(issue('billed_people_unknown','출장뷔페의 저장된 계산 인원을 확인해야 합니다.'));
    if(fee==null||tax&&fee>tax.supply)line.reasons.push(issue('buffet_setup_unknown','저장된 출장·세팅비를 확인해야 합니다.'));
    if(snapshot?.bbq||Number(snapshot?.beer)>0||Number(snapshot?.soju)>0)line.reasons.push(issue('buffet_options_cost_unknown','바베큐·주류의 별도 원가 기준을 확인해야 합니다.'));
    if(tax&&line.quantity&&fee!=null)costEx=tax.supply-line.quantity*10000-Math.min(fee,100000);
  }else if(kind==='reception') {
    line.quantity=money(snapshot?.people);
    const food=money(snapshot?.food),fee=money(snapshot?.fee);
    if(!line.quantity)line.reasons.push(issue('service_people_unknown','케이터링의 저장된 식사 인원을 확인해야 합니다.'));
    if(tax&&(food==null||fee==null||food+fee!==tax.supply))line.reasons.push(issue('reception_composition_unknown','음식과 배송·세팅비의 저장 금액을 확인해야 합니다.'));
    if(tax&&line.quantity&&food!=null&&fee!=null)costEx=tax.supply-(valueCourses.has(snapshot.course)?Math.round(food*0.3):line.quantity*5000);
  }else {
    line.quantity=money(snapshot?.cups);const pkg=policy.cocktailTable.find(row=>row.cups===line.quantity);
    if(!pkg)line.reasons.push(issue('cocktail_package_unknown','현재 공급가가 있는 저장 칵테일 패키지를 확인해야 합니다.'));
    if(money(snapshot?.bartender_fee)==null)line.reasons.push(issue('bartender_fee_unknown','저장된 바텐더 출장·제조비를 확인해야 합니다.'));
    if(pkg)costEx=pkg.vendor_supply;
    line.basis='현재 칵테일 공급가 · 바텐더 원가 0원 · 부가세 포함';
  }
  if(costEx!=null&&(!Number.isSafeInteger(costEx)||costEx<0))line.reasons.push(issue('model_cost_invalid','저장 판매가와 현재 마진 기준이 맞지 않아 예상원가를 확정할 수 없습니다.'));
  if(sale==null)line.reasons.push(issue('service_sale_unknown','계약에 포함된 서비스 판매금액을 확인해야 합니다.'));
  if(!line.reasons.length&&costEx!=null){line.cost=costEx+Math.round(costEx/10);line.profit=sale-line.cost;}
  return line;
}
const unknownLine=(label,sale,reason,kind='other')=>({kind,label,sale,cost:null,profit:null,basis:'확인 필요',quantity:null,reasons:[reason]});
const rentalLine=sale=>({kind:'rental',label:names.rental,sale,cost:0,profit:sale,basis:'대관·인원 원가 0원',quantity:null,reasons:sale==null?[issue('rental_sale_unknown','서비스 포함 범위 확인 후 대관 금액을 계산합니다.')]:[]});
function addonLine(kind,sale,reference,manager) {
  const line={kind,label:names[kind],sale,cost:null,profit:null,basis:'저장 판매가의 전체 원가 유지 · 마진 부가세 포함',quantity:1,reasons:[]};
  let margin=kind==='cleaning'?110000:40000;
  if(kind==='manager') {
    const count=money(manager?.count),hours=manager?.hours==null||manager.hours===''?null:Number(manager.hours);
    if(!count||!Number.isFinite(hours)||hours<=0||!Number.isSafeInteger(hours*10000)||!selected(manager)){line.quantity=null;line.reasons.push(issue('manager_quantity_unknown','매니저의 저장된 인원과 이용시간을 확인해야 합니다.'));}
    else{line.quantity=count*hours;margin=line.quantity*10000;}
  }
  if(sale==null||reference==null)line.reasons.push(issue('addon_sale_unknown','부가서비스의 저장 판매금액을 확인해야 합니다.'));
  else if(reference<margin)line.reasons.push(issue('model_cost_invalid','저장 판매금액이 마진 기준보다 작아 예상원가를 확인해야 합니다.'));
  if(!line.reasons.length){line.cost=reference-margin;line.profit=sale-line.cost;}
  return line;
}
function discountedCore(rows,discount) {
  if(rows.some(row=>money(row.amount)==null))return null;
  const sum=rows.reduce((n,row)=>n+Number(row.amount),0);if(discount>sum)return null;if(!sum)return rows.map(()=>0);
  const target=sum-discount,parts=rows.map((row,index)=>{const raw=BigInt(row.amount)*BigInt(target);return {index,value:Number(raw/BigInt(sum)),remainder:raw%BigInt(sum)};});
  let rest=target-parts.reduce((n,part)=>n+part.value,0);
  for(const part of [...parts].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(!rest--)break;parts[part.index].value++;}
  return parts.map(part=>part.value);
}

export function calculateBookingProfit(booking,context,policy) {
  const foodOnly=booking.space_id===FOOD_SPACE;
  const amount=booking.settlement.amount,d=context?.inquiry_data||{},direct=context?.catering_data;
  const lines=[],reasons=[],snapshots={};
  if(!context)reasons.push(issue('booking_context_missing','예약의 서비스 구성 정보를 다시 확인해야 합니다.'));
  const inquirySafe=context?.sibling_count===1||(context?.inquiry_date===booking.event_date&&context?.inquiry_space===booking.space_id&&context?.event_sibling_count===1);
  if(inquirySafe)for(const kind of foodKinds)if(d[kind])snapshots[kind]=d[kind];
  if(direct)snapshots.catering={...direct.data,status:direct.status,total:direct.total};
  // A rental-only saved estimate cannot settle an active food service's inclusion.
  const unresolvedFood=foodKinds.some(kind=>{
    const snapshot=snapshots[kind],included=kind==='catering'&&direct?money(direct.data?.included_amount):money(d['included_'+kind+'_amount']);
    const flag=kind==='catering'&&direct?direct.data?.include_in_booking:d[kind+'_in_quote'];
    return included>0||snapshot&&!snapshot.removed&&snapshot.status!=='cancelled'&&included!==0&&flag!==false&&flag!==0;
  });
  // Food-only contracts use their currently applied service amounts and snapshots.
  const quote=foodOnly?null:context?.quote_data||(!unresolvedFood?savedCleaningEstimateQuote(booking,context):null);
  const quoteMatches=quote&&money(quote.total)===amount;
  const extras=quoteMatches&&Array.isArray(quote.extras)?quote.extras:[];
  const manager=quoteMatches&&Object.hasOwn(quote.options||{},'manager')?quote.options.manager:inquirySafe?d.options?.manager:null;
  if(quoteMatches) {
    const core=Array.isArray(quote.lines)?quote.lines:[],discount=money(quote.discount)??0;
    const sales=discountedCore(core,discount);
    if(!sales||money(quote.subtotal)!=null&&core.reduce((n,row)=>n+(money(row.amount)??0),0)!==Number(quote.subtotal))reasons.push(issue('discount_allocation_unknown','저장된 기본 구성과 할인 금액의 적용 범위를 확인해야 합니다.'));
    for(const [index,row] of core.entries()) {
      const kind=kindOf(row),sale=sales?.[index]??null;
      if(kind==='rental')lines.push(rentalLine(sale));
      else if(['cleaning','manager','banner'].includes(kind))lines.push(addonLine(kind,sale,money(row.amount),manager));
      else lines.push(unknownLine(String(row.label||names.other),sale,issue('other_service_cost_unknown','이 서비스의 원가 기준을 확인해야 합니다.')));
    }
    for(const extra of extras) {
      const kind=kindOf(extra),sale=money(extra.amount);
      if(foodKinds.includes(kind)) {
        const snapshot=extra[kind]||(money(snapshots[kind]?.total)===sale?snapshots[kind]:null);
        lines.push(serviceLine(kind,sale,snapshot,policy));
      }
      else if(kind==='rental')lines.push(rentalLine(sale));
      else if(['cleaning','manager','banner'].includes(kind))lines.push(addonLine(kind,sale,money(extra.amount),manager));
      else lines.push(unknownLine(String(extra.label||names.other),sale,issue('other_service_cost_unknown','이 추가 항목의 서비스 원가 기준을 확인해야 합니다.')));
    }
    for(const kind of foodKinds) {
      const included=kind==='catering'&&direct?money(direct.data?.included_amount):money(d['included_'+kind+'_amount']);
      const flag=kind==='catering'&&direct?direct.data?.include_in_booking:d[kind+'_in_quote'],snapshot=snapshots[kind];
      const applies=kind==='catering'&&direct||inquirySafe,inactive=snapshot?.removed||snapshot?.status==='cancelled';
      const flagged=(flag===true||flag===1)&&snapshot&&!inactive&&included!==0;
      if(applies&&!inactive&&(included>0||flagged)&&!extras.some(extra=>kindOf(extra)===kind))
        lines.push(unknownLine(names[kind],null,issue('included_service_not_in_quote','포함된 식음료와 저장 견적 구성의 적용 범위를 확인해야 합니다.'),kind));
    }
    const total=lines.reduce((n,line)=>n+(line.sale??0),0);
    if(lines.some(line=>line.sale==null)||total!==amount)reasons.push(issue('contract_composition_unknown','저장 견적 구성과 확정 예약금액이 일치하지 않습니다.'));
    for(const [key,value] of Object.entries(quote.options||{}))if(selected(value)&&![...core,...extras].some(row=>kindOf(row)===key||key==='xbanner'&&/X\s*배너|엑스배너/i.test(String(row.label))))
      lines.push(unknownLine(key,0,issue('included_option_cost_unknown','대관 금액에 포함된 선택 옵션의 원가를 확인해야 합니다.')));
  }else {
    let included=0,ambiguous=false;
    for(const kind of foodKinds) {
      const snapshot=snapshots[kind],includedAmount=kind==='catering'&&direct?money(direct.data?.included_amount):money(d['included_'+kind+'_amount']);
      const flag=kind==='catering'&&direct?direct.data?.include_in_booking:d[kind+'_in_quote'];
      if(includedAmount>0||(includedAmount===0&&(flag===true||flag===1))){included+=includedAmount;lines.push(serviceLine(kind,includedAmount,snapshot,policy));}
      else if((snapshot||d[kind])&&flag!==false&&flag!==0&&includedAmount!==0){ambiguous=true;lines.push(unknownLine(names[kind],null,issue('service_inclusion_unknown','저장된 식음료가 이 예약금액에 포함되는지 확인해야 합니다.'),kind));}
    }
    for(const [key,value] of Object.entries(d.options||{}))if(selected(value))lines.push(unknownLine(key,0,issue('included_option_cost_unknown','선택 옵션의 서비스 원가를 확인해야 합니다.')));
    const previousServices=quote&&[...(quote.lines||[]),...(quote.extras||[])].some(line=>kindOf(line)!=='rental');
    const previousOptions=quote&&Object.values(quote.options||{}).some(selected);
    if(quote&&(previousServices||previousOptions||(included===0&&foodKinds.some(kind=>snapshots[kind]||d[kind])))) {
      ambiguous=true;lines.push(unknownLine('이전 견적의 서비스 구성',null,issue('contract_changed','이전 서비스 견적과 현재 계약금액의 적용 범위를 확인해야 합니다.')));
    }
    if(amount!=null&&included>amount){ambiguous=true;reasons.push(issue('included_services_exceed_contract','서비스 포함 금액이 확정 예약금액보다 큽니다.'));}
    if(foodOnly) {
      if(amount!=null&&included!==amount)
        reasons.push(issue('food_composition_unknown','확정 예약금액과 현재 적용된 식음료 구성이 일치하지 않습니다.'));
    } else lines.unshift(rentalLine(amount==null||ambiguous?null:amount-included));
  }
  if(amount==null)reasons.push(issue('contract_amount_unknown','확정 예약금액이 미정입니다.'));
  if(quote?.source==='inquiry-estimate')for(const line of lines)line.basis+=' · 문의에 저장된 요금 계산 내역';
  for(const line of lines)reasons.push(...line.reasons);
  const unique=[...new Map(reasons.map(reason=>[reason.code,reason])).values()],complete=amount!=null&&!unique.length&&lines.every(line=>line.cost!=null&&line.profit!=null);
  return {booking_code:booking.booking_code,customer_name:booking.customer_name,date:booking.event_date,space_id:booking.space_id,
    status:booking.settlement.booking_status,contractAmount:amount,serviceCost:complete?lines.reduce((n,line)=>n+line.cost,0):null,
    profit:complete?amount-lines.reduce((n,line)=>n+line.cost,0):null,complete,reasons:unique,lines};
}

const totals=()=>({bookingCount:0,contractAmount:0,amountUnknownCount:0,completeBookingCount:0,unknownBookingCount:0,knownContractAmount:0,knownServiceCost:0,knownProfit:0});
function add(total,item){total.bookingCount++;if(item.contractAmount==null)total.amountUnknownCount++;else total.contractAmount+=item.contractAmount;
  if(item.complete){total.completeBookingCount++;total.knownContractAmount+=item.contractAmount;total.knownServiceCost+=item.serviceCost;total.knownProfit+=item.profit;}else total.unknownBookingCount++;}
const finish=total=>({...total,totalCost:total.unknownBookingCount?null:total.knownServiceCost,totalProfit:total.unknownBookingCount?null:total.knownProfit,coverage:total.bookingCount?total.completeBookingCount/total.bookingCount:1});
export async function revenueProfitAdmin({env,url,method,operationalBookingSql='1=1'}) {
  if(method!=='GET')return err('지원하지 않는 요청입니다.',405);
  const scope=revenueBookingScope(url);if(scope.error)return scope.error;
  const page=Number(url.searchParams.get('page')??1),pageSize=50;
  if(!Number.isSafeInteger(page)||page<1||page>100000)return err('조회 조건을 확인해 주세요.');
  const cohort=await revenueBookingCohort({env,...scope,operationalBookingSql},true),sources=await profitSourcesFor(env,cohort.map(row=>row.booking_code));
  const policy=profitPolicy(await readCocktailPricing(env)),items=cohort.map(row=>calculateBookingProfit(row,sources[row.booking_code],policy));
  const summary=totals(),monthly=new Map(),services=Object.fromEntries(Object.entries(names).map(([kind,label])=>[kind,{kind,label,knownSale:0,knownCost:0,knownProfit:0,unknownCount:0}]));
  const cursor=new Date(scope.from.slice(0,7)+'-01T00:00:00Z');while(cursor.toISOString().slice(0,7)<=scope.to.slice(0,7)){const month=cursor.toISOString().slice(0,7);monthly.set(month,{month,...totals()});cursor.setUTCMonth(cursor.getUTCMonth()+1);}
  for(const item of items){add(summary,item);add(monthly.get(item.date.slice(0,7)),item);for(const line of item.lines){const service=services[line.kind];if(line.profit==null)service.unknownCount++;else{service.knownSale+=line.sale;service.knownCost+=line.cost;service.knownProfit+=line.profit;}}}
  return json({ok:true,scope:{...scope,statuses:['confirmed','completed'],filters:'period-space',basis:'confirmed-contract'},policy,summary:finish(summary),
    monthly:[...monthly.values()].map(finish),services:Object.values(services),items:items.slice((page-1)*pageSize,page*pageSize),detailCount:items.length,page,pageSize},200,{'cache-control':'no-store'});
}
