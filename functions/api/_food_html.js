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
  html=html.replace(/(<div class="hero-mega" aria-label="핵심 정보"><span>1인 <b>)[\d,]+/,(_,prefix)=>prefix+keep(comma(cmin)));
  const defaults={};function set(old,value){defaults[comma(old)]=value;}
  for(const c of CATERING.courses){
   const map={};if(c.kind==='flat')c.tiers.forEach(t=>{map[comma(t.price)]=cp['course.'+c.id+'.'+t.people];map[comma(Math.round(t.price*1.1))]=Math.round(cp['course.'+c.id+'.'+t.people]*1.1);set(t.price,cp['course.'+c.id+'.'+t.people]);});else{map[comma(c.price)]=cp['course.'+c.id];map[comma(Math.round(c.price*1.1))]=Math.round(cp['course.'+c.id]*1.1);if(c.id!=='galbi')set(c.price,cp['course.'+c.id]);}
   html=html.replace(new RegExp('<tr[^>]*><th scope="row"><b>'+c.name+'<\\/b>[\\s\\S]*?<\\/tr>','g'),s=>money(s,map));
   html=html.replace(new RegExp('<details class="cat-course" id="course-'+c.id+'"[\\s\\S]*?<\\/details>','g'),s=>money(s,map));
  }
  for(const b of CATERING.bbq.rows){const sale=cp['bbq.'+b.id];html=html.replace(new RegExp('<tr><th scope="row">'+b.size+'<\\/th>[\\s\\S]*?<\\/tr>','g'),s=>money(s,{[comma(b.price)]:sale,[comma(Math.round(b.price*1.1))]:Math.round(sale*1.1)}));}
  const net=cp['course.classic']*60+cp.delivery,gross=net+Math.round(net/10),baseFood=CATERING.courses.find(c=>c.id==='classic').price*60,baseNet=baseFood+CATERING.delivery.fee,baseGross=baseNet+Math.round(baseNet/10);
  Object.assign(defaults,{[comma(baseFood)]:cp['course.classic']*60,[comma(baseNet)]:net,[comma(Math.round(baseNet/10))]:Math.round(net/10),[comma(baseGross)]:gross,[comma(Math.round(baseGross/60/100)*100)]:Math.round(gross/60/100)*100,'100,000':cp.delivery,'120,000':cp.beer,'132,000':cp.beer+Math.round(cp.beer/10)});
  html=html.replace(/특선 갈비탕 상차림\(1인 40,000원\)/g,'특선 갈비탕 상차림(1인 '+keep(comma(cp['course.galbi']))+'원)');
  const drinks=[];html=html.replace(/<!-- drinks-summary:start -->[\s\S]*?<!-- drinks-summary:end -->/g,s=>{drinks.push(s);return '@@DRINKS'+(drinks.length-1)+'@@';});
  html=money(html,defaults).replace(/@@DRINKS(\d+)@@/g,(_,i)=>drinks[+i]);
 }
 if(path.startsWith('/reception')&&html.includes('data-reception-provider="cafefriends"'))html=html.replace(/(<p class="cf-package-price" data-cf-price="([^"]+)">)[^<]*(<\/p>)/g,(_,a,id,z)=>a+(rp['course.'+id]==null?'상담 후 견적':'1인 '+keep(comma(rp['course.'+id]))+'원 · 부가세 별도')+z);
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
  html=html.replace(/(<article class="home-food-card" id="reception">[\s\S]*?<div class="hero-mega"><span><b>)[\d,]+/,(_,a)=>a+(rmin==null?'맞춤':comma(rmin)));
 }
 html=html.replace(/@@FOODPRICE(\d+)@@/g,(_,i)=>slots[+i]);
 return html.replace('</head>','<script>window.MEGASPOT_FOOD_RATES='+JSON.stringify(rates).replace(/</g,'\\u003c')+';</script><script src="/assets/js/food-pricing.js?v=20261105cafefriends1"></script></head>');
}
