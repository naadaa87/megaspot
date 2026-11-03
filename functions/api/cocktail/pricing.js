import {json} from '../_lib.js';
import {readCocktailPricing,publicCocktailPricing} from '../_cocktail_pricing.js';
export async function onRequestGet({env}){try{return json({ok:true,...publicCocktailPricing(await readCocktailPricing(env))},200,{'cache-control':'no-store'});}catch{return json({ok:false,error:'가격표를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'},503,{'cache-control':'no-store'});}}
