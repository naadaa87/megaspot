/* Keep the selected service estimate within reach on mobile. */
(function(){
  var calc=document.querySelector('#cat-calc,#cocktail-calc,#reception-calc');if(!calc)return;
  var bar=document.createElement('div');bar.className='food-mobile-summary';bar.setAttribute('aria-label','식음료 견적 요약');
  var label=document.createElement('span'),link=document.createElement('a');link.href='#calc';link.textContent='구성·견적 보기 ↑';bar.append(label,link);document.body.appendChild(bar);
  var quick=document.querySelector('.quick-bar');if(quick)quick.remove();
  function paint(){var price=calc.querySelector('.cc-total>b');var value=price?'선택한 식음료 '+price.textContent:'식음료 구성과 인원을 확인해 주세요';if(label.textContent!==value)label.textContent=value;}
  new MutationObserver(paint).observe(calc,{childList:true,subtree:true,characterData:true});paint();
})();
