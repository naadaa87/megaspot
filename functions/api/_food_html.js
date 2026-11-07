import {CATERING} from './_catalog.js';
import RECEPTION from '../../assets/js/data/reception-quote.js';
import ITEMS from '../../assets/js/data/reception-items.js';
const comma=n=>String(n).replace(/\B(?=(\d{3})+(?!\d))/g,',');
export function foodHtml(html,path,rates){
 const cp=rates.catering.prices,rp=rates.reception.prices,cmin=Math.min(...CATERING.courses.filter(c=>c.kind==='per'&&c.group!=='light').map(c=>cp['course.'+c.id])),rprices=(RECEPTION.activeCatalog?RECEPTION.activeCatalog.offerings:RECEPTION.courses).map(c=>rp['course.'+c.id]).filter(v=>Number.isSafeInteger(v)&&v>0),rmin=rprices.length?Math.min(...rprices):null;
 const slots=[];function keep(value){slots.push(String(value));return '@@FOODPRICE'+(slots.length-1)+'@@';}
 // Shared navigation, FAQ answers (including JSON-LD) and cross-service cards
 // must use the same minimum as the calculator, even outside the service page.
 // Protect inserted amounts from the legacy per-course substitutions below.
 html=html.replace(/25,000원부터/g,()=>rmin==null?'메뉴·구성 상담':keep(comma(rmin))+'원부터');
 html=html.replace(/(<div class="hero-mega"><span><b>)25,000(?=<\/b>원부터)/g,(_,prefix)=>prefix+keep(rmin==null?'맞춤':comma(rmin)));
 html=html.replace(/(코스별 1인 가격\()[\d,]+(?=원부터, 부가세 별도)/g,(_,prefix)=>prefix+keep(comma(cmin)));
 function money(s,map){return s.replace(/\d[\d,]*(?=원|<)/g,v=>Object.prototype.hasOwnProperty.call(map,v)?keep(comma(map[v])):v);}
 if(path.startsWith('/catering')){
  // Each visible amount is bound to its catalog ID. Equal default prices must
  // never link unrelated products, examples, or bottle drinks together.
  const values={...cp,'minimum.buffet':cmin};
  for(const [key,value] of Object.entries(cp))values[key+'.gross']=value+Math.round(value/10);
  values['example.food']=cp['course.classic']*60;
  values['example.net']=values['example.food']+cp.delivery;
  values['example.vat']=Math.round(values['example.net']/10);
  values['example.total']=values['example.net']+values['example.vat'];
  values['example.perPerson']=Math.round(values['example.total']/60/100)*100;
  html=html.replace(/<data data-catering-price="([^"]+)" value="[^"]*">[^<]*<\/data>/g,(_,key)=>{
   if(!Number.isSafeInteger(values[key])||values[key]<0)throw Error('Unknown catering price: '+key);
   return '<data data-catering-price="'+key+'" value="'+values[key]+'">'+comma(values[key])+'</data>';
  });
  const title='메가스팟 출장뷔페 | 1인 '+comma(cmin)+'원부터 · 대관과 함께 신청 · 바베큐·생맥주';
  const description='메가스팟 건대 1호·2호 대관과 출장뷔페를 함께 준비합니다. 20·30인 정액 소규모 스페셜, 1인 '+comma(cp['course.basic'])+'원 베이직부터 VIP 스페셜까지 뷔페 코스와 다과 파티·갈비탕 상차림, 바베큐·생맥주 가격과 메뉴를 확인하고 출장·세팅비·부가세를 포함한 예상 금액을 계산하세요.';
  html=html.replace(/<title>[^<]*<\/title>/,'<title>'+title+'</title>')
   .replace(/(<meta (?:name="description"|property="og:description"|name="twitter:description") content=")[^"]*/g,(_,a)=>a+description)
   .replace(/(<meta (?:property="og:title"|name="twitter:title") content=")[^"]*/g,(_,a)=>a+title);
  const answers=new Map();
  html.replace(/<details data-catering-faq="[^"]+"><summary>([^<]+)<\/summary><div class="body">([\s\S]*?)<\/div><\/details>/g,(_,question,answer)=>{answers.set(question,answer.replace(/<[^>]*>/g,''));return '';});
  const unitPrices=CATERING.courses.filter(c=>c.kind==='per').map(c=>cp['course.'+c.id]);
  html=html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g,(_,a,raw,z)=>{
   const schema=JSON.parse(raw);
   for(const item of schema['@graph']||[]){
    if(item['@type']==='Service'){item.description=description;if(item.offers)Object.assign(item.offers,{lowPrice:String(Math.min(...unitPrices)),highPrice:String(Math.max(...unitPrices)),offerCount:String(unitPrices.length)});}
    if(item['@type']==='WebPage'){item.name=title;item.description=description;}
    if(item['@type']==='FAQPage')for(const question of item.mainEntity||[])if(answers.has(question.name))question.acceptedAnswer.text=answers.get(question.name);
   }
   return a+JSON.stringify(schema).replace(/</g,'\\u003c')+z;
  });
 }
 if(path.startsWith('/reception')&&html.includes('data-reception-provider="cafefriends"'))html=html.replace(/(<p class="cf-package-price" data-cf-price="([^"]+)">)[^<]*(<\/p>)/g,(_,a,id,z)=>a+(rp['course.'+id]==null?'상담 후 견적':'1인 '+keep(comma(rp['course.'+id]))+'원 · 부가세 별도')+z);
 if(path.startsWith('/reception'))html=html.replace(/(<span data-cf-fee="([^"]+)">)[^<]*(<\/span>)/g,(_,a,id,z)=>a+(rp[id]==null?'상담 후 견적':keep(comma(rp[id]))+'원')+z);
 if(path.startsWith('/reception')&&!html.includes('data-reception-provider="cafefriends"')){
  const drinks=[];html=html.replace(/<!-- drinks-summary:start -->[\s\S]*?<!-- drinks-summary:end -->/g,s=>{drinks.push(s);return '@@RECDRINKS'+(drinks.length-1)+'@@';});
  html=html.replace(/<table class="est-lines reception-fee-table">[\s\S]*?<\/table>/,()=>'<table class="est-lines reception-fee-table"><thead><tr><th>인원</th><th>도시락</th><th>박스</th><th>테이블 세팅</th></tr></thead><tbody>'+[50,100,200,300].map((n,i)=>'<tr><td>'+['50명 이하','51~100명','101~200명','201~300명'][i]+'</td>'+['lunchbox','box','table'].map(f=>'<td class="r">'+keep(comma(rp['fee.'+f+'.'+RECEPTION.feesByFormat[f].find(b=>n<=b.upto).upto]))+'원</td>').join('')+'</tr>').join('')+'</tbody></table>');
  html=html.replace(/테이블 세팅·철수 비용은 50명 이하 20만 원, 51~100명 25만 원입니다\./g,'제공 방식과 인원별 비용은 위 가격표를 확인해 주세요.');
  let item=0;html=html.replace(/<p class="reception-item-price">[^<]*<\/p>/g,s=>{const row=ITEMS[item++];return s.replace(/[\d,]+원$/,v=>v).replace(/[\d,]+원(?=<\/p>)/,keep(comma(rp[row.id]))+'원');});
  const net=rp['course.classic']*50,fee=rp['fee.table.50'];
  html=money(html,{'1,750,000':net,'200,000':fee,'1,950,000':net+fee,'195,000':Math.round((net+fee)/10),'2,145,000':net+fee+Math.round((net+fee)/10),'25,000':rp['course.light'],'35,000':rp['course.classic'],'45,000':rp['course.premium'],'55,000':rp['course.signature']});
  html=html.replace(/@@RECDRINKS(\d+)@@/g,(_,i)=>drinks[+i]);
 }
 if(path==='/'){
  html=html.replace(/(<article class="home-food-card" id="catering">[\s\S]*?<div class="hero-mega"><span>1인 <b>)[\d,]+/,(_,a)=>a+comma(cmin));
  // Bound legacy minimum-price updates to this card: a consultation label has no
  // numeric price, and must never consume the following cocktail card's cup count.
  html=html.replace(/<article class="home-food-card" id="reception">[\s\S]*?<\/article>/g,card=>card.replace(/(<div class="hero-mega"><span><b>)[\d,]+(<\/b>원부터)/,(_,a,z)=>a+(rmin==null?'맞춤':comma(rmin))+z));
 }
 html=html.replace(/@@FOODPRICE(\d+)@@/g,(_,i)=>slots[+i]);
 return html.replace('</head>','<script>window.MEGASPOT_FOOD_RATES='+JSON.stringify(rates).replace(/</g,'\\u003c')+';</script><script src="/assets/js/food-pricing.js?v=20261105cfbudget1"></script></head>');
}
