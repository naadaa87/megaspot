// Only public selling prices enter HTML, metadata and calculator bootstrap data.
export function cocktailHtml(html,path,config){
 const fee=config.bartender_fee??200000,prices=config.prices,won=n=>Number(n).toLocaleString('ko-KR'),man=n=>n%10000===0?won(n/10000)+'만원':won(n)+'원',min=man(prices[100]),max=man(prices[400]);
 if(path==='/cocktail/'||path==='/cocktail'){
  html=html.replace(/100잔 [\d,]+(?:만원|원)부터/g,'100잔 '+min+'부터').replace(/400잔 [\d,]+(?:만원|원)까지/g,'400잔 '+max+'까지');
  html=html.replace(/(<section class="page-hero cocktail-hero">[\s\S]*?<span><b>)[\d,]+(<\/b>만원부터)/,(_,a)=>a+won(prices[100])+ '</b>원부터');
  let index=0;html=html.replace(/<article class="cocktail-price">[\s\S]*?<\/article>/g,block=>{const cups=[100,200,300,400][index++],price=prices[cups],unit=price/cups;return block.replace(/<strong>[\s\S]*?<\/strong>/,'<strong>'+won(price)+'<small>원</small></strong>').replace(/<p>잔당 [\s\S]*?<\/p>/,'<p>잔당 '+(Number.isInteger(unit)?'':'약 ')+won(Math.round(unit))+'원 · 부가세 별도</p>');});
  html=html.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,(whole,text)=>{try{const data=JSON.parse(text);if(data['@type']==='Service'&&Array.isArray(data.offers))for(const offer of data.offers){const n=Number(String(offer.name).match(/\d+/)?.[0]);if(prices[n])offer.price=String(prices[n]+fee);offer.description='패키지 '+won(prices[n])+'원 + 바텐더 출장 및 제조 '+won(fee)+'원, 부가세 별도';}return '<script type="application/ld+json">'+JSON.stringify(data)+'</script>';}catch{return whole;}});
 }
 if(path==='/')html=html.replace(/(<article class="home-food-card" id="cocktail">[\s\S]*?<span><b>)[\d,]+(<\/b>만원부터)/,(_,a)=>a+won(prices[100])+'</b>원부터');
 const bootstrap=JSON.stringify(config).replace(/</g,'\\u003c');return html.replace('</head>','<script>window.MEGASPOT_COCKTAIL_PRICING='+bootstrap+';</script>\n</head>');
}
