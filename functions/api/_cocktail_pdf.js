// The prebuilt PDF has fixed-width ASCII number slots in an uncompressed stream.
// Replacing equal-length bytes keeps every stream length and cross-reference valid.
let templateBytes=null,lastKey='',lastBytes=null;
const encoder=new TextEncoder();
const layout={PRICE:{right:380,y:91,size:22},UNIT:{right:166,y:44,size:11},VAT:{right:166,y:18,size:11},TOTAL:{right:389,y:18,size:11}};
export function buildCocktailPdf(template,config){
 const bytes=new Uint8Array(template).slice(),text=new TextDecoder('latin1').decode(bytes);
 [100,200,300,400].forEach((cups,i)=>{const x=52+(i%2)*438,price=config.prices[cups],vat=Math.round(price/10),values={PRICE:price,UNIT:Math.round(price/cups),VAT:vat,TOTAL:price+vat};
  for(const [field,value] of Object.entries(values)){
   const padded=String(value).replace(/\B(?=(\d{3})+(?!\d))/g,',').padStart(16,' '),slot=layout[field];
   if(padded.length!==16)throw Error('Price does not fit PDF');
   const marker=text.indexOf('%MS_'+cups+'_'+field+'\n');if(marker<0)throw Error('Missing PDF field');
   const position=text.indexOf('BT 1 0 0 1 ',marker)+11,numberStart=text.indexOf(' Tm (',position)+5;
   if(position<11||numberStart<5||text[numberStart+16]!==')')throw Error('Invalid PDF field');
   // Helvetica-Bold uses 556 units for digits and 278 for comma/space.
   const width=Array.from(padded).reduce((sum,c)=>sum+(/[0-9]/.test(c)?556:278),0)*slot.size/1000;
   const coordinate=(x+slot.right-width).toFixed(6).padStart(14,'0');if(coordinate.length!==14)throw Error('Invalid PDF coordinate');
   bytes.set(encoder.encode(coordinate),position);bytes.set(encoder.encode(padded),numberStart);
  }
 });return bytes;
}
export async function serveCocktailPdf(context,config){
 const key=JSON.stringify(config.prices);
 if(lastKey!==key||!lastBytes){
  if(!templateBytes){const asset=await context.env.ASSETS.fetch(new URL('/assets/docs/megaspot-cocktail-pricing-template.pdf',context.request.url));if(!asset.ok)throw Error('Missing guide template');templateBytes=await asset.arrayBuffer();}
  lastBytes=buildCocktailPdf(templateBytes,config);lastKey=key;
 }
 return new Response(context.request.method==='HEAD'?null:lastBytes,{headers:{'content-type':'application/pdf','content-disposition':'inline; filename="megaspot-cocktail-service-guide.pdf"','cache-control':'no-store','x-cocktail-pricing-revision':String(config.revision)}});
}
