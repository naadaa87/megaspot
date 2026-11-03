import {readFoodPricing,publicFoodPricing} from '../_food_pricing.js';
import {json,err} from '../_lib.js';
export async function onRequestGet({env}){try{return json(publicFoodPricing(await readFoodPricing(env,'catering')),200,{'cache-control':'no-store'});}catch{return err('가격표를 불러오지 못했습니다.',503);}}
