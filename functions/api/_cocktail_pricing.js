// The persistent supplier/sale configuration is exposed only to administrators.
export const COCKTAIL_KEY='cocktail_pricing';
export const CUPS=[100,200,300,400];
export const BARTENDER_FEE=200000;
const COSTS={100:800000,200:1100000,300:1500000,400:1800000};
const SALES={100:1200000,200:1800000,300:2300000,400:2700000};
export function cocktailPricing(config){return CUPS.map(cups=>{const row=config?.packages?.find(p=>p.cups===cups),vendor_supply=row?.vendor_supply??COSTS[cups],sale_price=row?.sale_price??SALES[cups];const subtotal=sale_price+BARTENDER_FEE,vat=Math.round(subtotal/10),margin=sale_price-vendor_supply;return {cups,vendor_supply,sale_price,bartender_fee:BARTENDER_FEE,subtotal,vat,total:subtotal+vat,margin,margin_rate:margin/sale_price};});}
export function publicCocktailPricing(config){const prices={};for(const row of cocktailPricing(config))prices[row.cups]=row.sale_price;return {prices,bartender_fee:BARTENDER_FEE,revision:config?.revision||0,updated_at:config?.updated_at||'',vat_rate:0.1};}
function validatedPackages(rows){
 if(!Array.isArray(rows)||rows.length!==4)throw Error('100·200·300·400잔 패키지를 모두 입력해 주세요.');
 const out=CUPS.map(cups=>{const matches=rows.filter(p=>p&&p.cups===cups);if(matches.length!==1)throw Error('패키지 구성을 확인해 주세요.');const p=matches[0];
  if(!Number.isSafeInteger(p.vendor_supply)||p.vendor_supply<0||p.vendor_supply>100000000)throw Error('공급가는 0~100,000,000원의 정수로 입력해 주세요.');
  if(!Number.isSafeInteger(p.sale_price)||p.sale_price<1||p.sale_price>100000000)throw Error('판매가는 1~100,000,000원의 정수로 입력해 주세요.');
  return {cups,vendor_supply:p.vendor_supply,sale_price:p.sale_price};});return out;
}
export async function readCocktailPricing(env){
 if(!env?.DB)return {revision:0,packages:cocktailPricing()};
 const row=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(COCKTAIL_KEY).first();
 if(!row)return {revision:0,packages:cocktailPricing()};
 const value=JSON.parse(row.value);validatedPackages(value.packages);if(!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('가격표 버전을 확인해 주세요.');return value;
}
export function adminCocktailPricing(config){return {ok:true,packages:cocktailPricing(config),revision:config.revision||0,updated_at:config.updated_at||'',vat_rate:0.1,public:publicCocktailPricing(config)};}
export async function saveCocktailPricing(env,input){
 const packages=validatedPackages(input?.packages),revision=input?.revision;
 if(!Number.isSafeInteger(revision)||revision<0)throw Error('가격표를 다시 불러온 뒤 저장해 주세요.');
 const current=await readCocktailPricing(env);if(current.revision!==revision)return {conflict:true};
 const normalized=cocktailPricing(current).map(({cups,vendor_supply,sale_price})=>({cups,vendor_supply,sale_price}));
 if(JSON.stringify(normalized)===JSON.stringify(packages))return {config:current,unchanged:true};
 const value={revision:revision+1,updated_at:new Date().toISOString(),packages},serialized=JSON.stringify(value);
 let result;
 if(revision===0)result=await env.DB.prepare('INSERT OR IGNORE INTO settings(key,value,updated_at) VALUES(?,?,?)').bind(COCKTAIL_KEY,serialized,value.updated_at).run();
 else result=await env.DB.prepare("UPDATE settings SET value=?,updated_at=? WHERE key=? AND json_extract(value,'$.revision')=?").bind(serialized,value.updated_at,COCKTAIL_KEY,revision).run();
 const changes=result.meta?.changes??result.changes;if(Number(changes)!==1)return {conflict:true};
 return {config:value};
}
