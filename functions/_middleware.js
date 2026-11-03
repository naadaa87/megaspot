import {readCocktailPricing,publicCocktailPricing} from './api/_cocktail_pricing.js';
import {cocktailHtml} from './api/_cocktail_html.js';
export async function onRequest(context){
 const url=new URL(context.request.url),path=url.pathname;
 if(path.startsWith('/api/'))return context.next();
 if(path==='/assets/docs/megaspot-cocktail-service-guide.pdf'){
  try{const {serveCocktailPdf}=await import('./api/_cocktail_pdf.js');return await serveCocktailPdf(context,publicCocktailPricing(await readCocktailPricing(context.env)));}
  catch{return new Response('소개서를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.',{status:503,headers:{'content-type':'text/plain;charset=utf-8','cache-control':'no-store'}});}
 }
 const response=await context.next();if(response.status!==200||!response.headers.get('content-type')?.includes('text/html'))return response;
 try{const config=publicCocktailPricing(await readCocktailPricing(context.env)),html=cocktailHtml(await response.text(),path,config),headers=new Headers(response.headers);headers.set('cache-control','no-store');headers.delete('etag');headers.delete('content-length');headers.delete('content-encoding');return new Response(html,{status:response.status,headers});}
 catch{return new Response('가격 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.',{status:503,headers:{'content-type':'text/plain;charset=utf-8','cache-control':'no-store'}});}
}
