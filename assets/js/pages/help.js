/* 자주 묻는 질문 (/help/) — 단어·키워드로 찾기 (2026-11-24)
   목록은 tools/faq/build.mjs 가 화면에 미리 넣어 둡니다. 이 스크립트는 거르기·강조만 합니다.
   ?q=주차 처럼 주소에 단어를 붙이면 바로 찾은 상태로 열리고, #q-xxxx 로 질문 하나를 바로 열 수 있습니다. */
(function(){
  var $=function(s,r){ return (r||document).querySelector(s); }, $$=function(s,r){ return Array.prototype.slice.call((r||document).querySelectorAll(s)); };
  var form=$('#hp-form'), input=$('#hp-q'), list=$('#hp-list'); if(!form||!input||!list) return;
  var items=$$('.hp-item',list), groups=$$('.hp-group',list), cats=$$('.hp-cat'), keys=$$('.hp-keys button'), count=$('#hp-count'), empty=$('#hp-empty');
  var cat='';

  // 같은 뜻으로 찾는 말 (한 묶음 안의 어느 말로 찾아도 같이 찾습니다)
  var SYN=[
    ['주차','파킹','주차장','주차권','차량'],
    ['요금','가격','금액','비용','얼마','대관료','공간료','견적'],
    ['환불','취소','위약금','변경'],
    ['보증금','디파짓','예치금'],
    ['뷔페','케이터링','출장뷔페','출장음식','식사','도시락','음식','다과'],
    ['주류','술','맥주','생맥주','와인','칵테일'],
    ['몇명','몇 명','명까지','수용','정원','최대 인원'],
    ['시간','연장','밤샘','올나잇','새벽','심야','조찬'],
    ['빔프로젝터','프로젝터','빔'],
    ['마이크','음향','스피커','앰프'],
    ['예약','대관','신청'],
    ['초대장','초청장','청첩','초대'],
    ['세금계산서','영수증','증빙','견적서','계산서'],
    ['오시는길','오시는 길','위치','주소','길찾기','지하철','건대입구'],
    ['입점','호스트','올릴','등록'],
    ['답사','투어','방문','미리 보기'],
    ['장식','풍선','현수막','데코'],
    ['확정서','확정','예약확인','예약 확인'],
    ['계약서','계약'],
    ['추첨','경품','룰렛','돌림판'],
    ['게임','퀴즈','빙고','밸런스','팀 나누기']
  ];
  // 넓은 말은 그 말을 넣었을 때만 아래 말까지 함께 찾습니다
  var BROAD={ '장비':['빔프로젝터','프로젝터','마이크','음향','스피커','스크린','앰프'], '음식':['뷔페','케이터링','주류','다과'] };
  var JOSA=/(으로|에서|까지|부터|이랑|하고|은|는|이|가|을|를|에|도|로|와|과|의|요)$/;
  function flat(s){ return String(s||'').toLowerCase().replace(/\s+/g,''); }
  function variants(tok){
    var t=flat(tok), out=[t];
    if(t.length>=2&&JOSA.test(t)&&t.replace(JOSA,'').length) out.push(t.replace(JOSA,''));
    SYN.forEach(function(g){ var fg=g.map(flat); if(out.some(function(v){ return fg.indexOf(v)>=0; })) fg.forEach(function(x){ if(out.indexOf(x)<0) out.push(x); }); });
    if(BROAD[t]) BROAD[t].forEach(function(x){ if(out.indexOf(x)<0) out.push(x); });
    return out.filter(function(x){ return x.length>0; });
  }
  // 찾을 글 (띄어쓰기 없이 비교)
  items.forEach(function(el){
    el._q=$('summary',el).textContent; el._a=$('.hp-a p',el).textContent;
    el._hay=flat(el._q+' '+el._a+' '+(($('.hp-src',el)||{}).textContent||''));
    el._qflat=flat(el._q);
  });

  function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
  function mark(text,words){
    if(!words.length) return escHtml(text);
    // 띄어쓰기가 달라도 강조되도록 글자 사이에 공백을 허용합니다
    var re=new RegExp('('+words.slice().sort(function(a,b){ return b.length-a.length; }).map(function(w){ return w.split('').map(escRe).join('\\s*'); }).join('|')+')','gi');
    return escHtml(text).replace(re,'<mark>$1</mark>');
  }

  function run(push){
    var q=input.value.trim(), toks=q?q.split(/[\s,·/]+/).filter(Boolean):[], sets=toks.map(variants), words=[];
    // 띄어 쓴 말(예: 빔 프로젝터)은 붙여서 먼저 찾아보고, 있으면 그 결과를 씁니다
    if(toks.length>1){ var whole=[variants(toks.join(''))]; if(items.some(function(el){ return whole[0].some(function(w){ return el._hay.indexOf(w)>=0; }); })) sets=whole; }
    sets.forEach(function(s){ s.forEach(function(w){ if(words.indexOf(w)<0) words.push(w); }); });
    var shown=0, scored=[];
    items.forEach(function(el){
      var okCat=!cat||el.dataset.cat===cat;
      var okQ=sets.every(function(s){ return s.some(function(w){ return el._hay.indexOf(w)>=0; }); });
      var on=okCat&&okQ; el.hidden=!on;
      if(on){ shown++; if(q) scored.push(el); }
      $('summary',el).innerHTML=mark(el._q,on&&q?words:[]);
      $('.hp-a p',el).innerHTML=mark(el._a,on&&q?words:[]);
    });
    groups.forEach(function(g){ g.hidden=!$$('.hp-item',g).some(function(el){ return !el.hidden; }); });
    // 분류 단추의 숫자는 지금 넣은 단어로 찾은 수
    var per={}, all=0; items.forEach(function(el){ if(sets.every(function(s){ return s.some(function(w){ return el._hay.indexOf(w)>=0; }); })){ all++; per[el.dataset.cat]=(per[el.dataset.cat]||0)+1; } });
    cats.forEach(function(b){ var sm=$('small',b); if(sm) sm.textContent=b.dataset.cat?(per[b.dataset.cat]||0):all; b.classList.toggle('zero',!!b.dataset.cat&&!per[b.dataset.cat]); });
    // 질문 글에 단어가 들어 있는 것을 먼저, 결과가 적으면 펼쳐서 보여 줍니다
    if(q){
      groups.forEach(function(g){ var arr=$$('.hp-item',g); arr.sort(function(a,b){ return rank(b,sets)-rank(a,sets); }).forEach(function(el){ g.appendChild(el); }); });
      scored.forEach(function(el){ el.open=shown<=6; });
    } else { restore(); }
    empty.hidden=shown>0;
    var total=items.length;
    count.innerHTML=q?('<b>‘'+escHtml(q)+'’</b>'+(shown?' 관련 질문 <b>'+shown+'</b>개':' 관련 질문을 찾지 못했습니다')+(cat?' · '+escHtml(label(cat))+' 안에서':'')):(cat?escHtml(label(cat))+' 질문 <b>'+shown+'</b>개':'질문 <b>'+total+'</b>개 · 단어를 넣거나 분류를 골라 보세요');
    keys.forEach(function(b){ b.classList.toggle('on',flat(b.dataset.k)===flat(q)); });
    if(push!==false){ try{ var u=new URL(location.href); if(q) u.searchParams.set('q',q); else u.searchParams.delete('q'); if(cat) u.searchParams.set('cat',cat); else u.searchParams.delete('cat'); u.hash=''; history.replaceState(null,'',u.pathname+u.search); }catch(e){} }
  }
  function rank(el,sets){ return sets.reduce(function(n,s){ return n+(s.some(function(w){ return el._qflat.indexOf(w)>=0; })?2:0)+(s.some(function(w){ return el._hay.indexOf(w)>=0; })?1:0); },0); }
  var ORIG=items.slice();
  function restore(){ ORIG.forEach(function(el){ el.parentNode.appendChild(el); }); }
  function label(k){ var b=cats.filter(function(x){ return x.dataset.cat===k; })[0]; return b?b.childNodes[0].textContent.trim():''; }
  function setCat(k){ cat=k; cats.forEach(function(b){ var on=b.dataset.cat===k; b.classList.toggle('on',on); b.setAttribute('aria-selected',on?'true':'false'); }); }

  var timer=null;
  input.addEventListener('input',function(){ clearTimeout(timer); timer=setTimeout(run,160); });
  form.addEventListener('submit',function(e){ e.preventDefault(); run(); var first=items.filter(function(el){ return !el.hidden; })[0]; if(first&&window.innerWidth<900) first.scrollIntoView({behavior:'smooth',block:'start'}); });
  keys.forEach(function(b){ b.addEventListener('click',function(){ input.value=b.dataset.k; run(); }); });
  cats.forEach(function(b){ b.addEventListener('click',function(){ setCat(b.dataset.cat); run(); }); });

  // 시작: ?q= · ?cat= · #q-xxxx
  var sp=new URLSearchParams(location.search), h=location.hash.slice(1);
  if(sp.get('cat')&&cats.some(function(b){ return b.dataset.cat===sp.get('cat'); })) setCat(sp.get('cat'));
  if(sp.get('q')) input.value=sp.get('q').slice(0,60);
  run(false);
  if(h&&/^q-[0-9a-f]+x*$/.test(h)){ var el=document.getElementById(h); if(el){ el.hidden=false; el.open=true; setTimeout(function(){ el.scrollIntoView({block:'start'}); },60); } }
})();
