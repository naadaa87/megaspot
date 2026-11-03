import F from '../../assets/js/food-services.js';
import {cateringAdmin} from './_catering.js';
import {cocktailFrom} from './_cocktail.js';
export {F};
export function cocktailAdmin(value,prices,revision){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const status=value.status||'pending';if(!['pending','confirmed','cancelled'].includes(status))return null;
 const result=cocktailFrom(value,prices,revision);return result?{...result,status,by:'admin'}:null;
}
export function syncFoodInput(input,data,fresh=false){return F.syncQuote(input,data,fresh);}
export function updateFood(data,kind,value){
 const next={...data,[kind]:value},oldIncluded=Number(data['included_'+kind+'_amount'])||0,include=oldIncluded>0||!!data[kind+'_in_quote'];
 const changed=F.key(kind,data[kind])!==F.key(kind,value);
 if(include&&data.total!=null){const amount=F.amount(kind,value);next.total=Math.max(0,Number(data.total)-oldIncluded+amount);next.amount_override=true;next['included_'+kind+'_amount']=amount;}
 if(changed)next.reception_revision=(Number(data.reception_revision)||0)+1;
 if(data.quote_input)next.quote_input=F.syncQuote(data.quote_input,next,false);
 return {data:next,changed};
}
export function foodExtras(extras,previous,prices,revision){
 const rows=Array.isArray(extras)?extras:[],result={amount:0,selections:{},included:{}};
 for(const kind of F.types){const found=rows.filter(x=>F.isRow(kind,x));if(found.length>1)return {error:'같은 식음료 항목은 견적에 한 번만 추가해 주세요.'};const row=found[0];if(!row){result.included[kind]=0;continue;}
  const raw=row[kind]||previous?.[kind],normalized=raw?(row[kind]?(kind==='catering'?cateringAdmin(raw):cocktailAdmin(raw,prices,revision)):{...raw}):null;
  if(normalized&&kind==='catering'){normalized.status=raw.status||'pending';normalized.meal_time=raw.meal_time||'';normalized.order_ref=raw.order_ref||'';}
  if(raw&&(!normalized||normalized.status==='cancelled'||raw.removed||F.amount(kind,normalized)!==Number(row.amount)))return {error:'출장뷔페·칵테일 구성과 금액을 다시 확인해 주세요.'};
  if(!Number.isFinite(Number(row.amount))||Number(row.amount)<0)return {error:'식음료 금액을 확인해 주세요.'};
  result.included[kind]=Number(row.amount);result.amount+=Number(row.amount);if(normalized){result.selections[kind]=normalized;row[kind]=normalized;row.kind=kind;}
 }
 return result;
}
export function stripFoodItems(items){return items.filter(x=>!/^출장뷔페 ·/.test(x)&&!/^출장 칵테일 ·/.test(x));}
export async function directFoodRevision(env,code){return Number((await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind('food_revision:'+code).first())?.value)||0;}
export function directRevisionStatement(env,code,revision,time){return env.DB.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind('food_revision:'+code,String(revision),time);}
export async function confirmationFoodData(env,row,order){
 if(row.inquiry_ref){try{return JSON.parse(row.idata||'{}')||{};}catch{return {};}}
 return {catering:order||null,included_catering_amount:order?.included_amount||0,catering_in_quote:!!order?.include_in_booking,reception_revision:await directFoodRevision(env,row.booking_code)};
}

// Enrich legacy selections with names without repricing their saved amount.
export function foodDocuments(data,total){return F.documents(data,total).map(value=>value.kind==='cocktail'?{...value,menu_names:value.menu_names||cocktailFrom(value)?.menu_names||[]}:value);}
