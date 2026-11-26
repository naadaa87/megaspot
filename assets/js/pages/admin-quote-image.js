/* 관리자 견적 계산 · 견적서 이미지 저장 (2026-11-26)
   [견적서 이미지 저장]을 누르면 인쇄용 견적서(#quote-print)와 같은 내용을 PNG 한 장으로 만들어 내려받습니다.
   견적서 모양은 인쇄용 CSS(@media print 안의 .qp 규칙)를 그대로 가져다 씁니다. 그림 도구는 계약서와 같은
   assets/js/vendor/html2pdf.bundle.min.js 를 누를 때 불러옵니다. 화면·저장 데이터는 바꾸지 않습니다. */
(function(){
  'use strict';
  var lib=null, css=null;
  function load(){
    if(window.html2pdf) return Promise.resolve(window.html2pdf);
    if(!lib) lib=new Promise(function(res,rej){ var s=document.createElement('script'); s.src='/assets/js/vendor/html2pdf.bundle.min.js'; s.onload=function(){ res(window.html2pdf); }; s.onerror=function(){ lib=null; rej(new Error('이미지 도구를 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.')); }; document.head.appendChild(s); });
    return lib;
  }
  // 인쇄용 견적서 규칙을 화면용으로 옮깁니다 (.q-shot 안에서만 적용)
  function printCss(){
    if(css!=null) return css;
    var out=[];
    function scope(sel){ return sel.split(',').map(function(x){ x=x.trim().split('#quote-print').join('').trim(); return '.q-shot '+x; }).join(','); }
    function walk(rules, inPrint){
      Array.prototype.forEach.call(rules||[], function(r){
        if(r.media && r.cssRules){ walk(r.cssRules, inPrint || /print/.test(r.media.mediaText)); return; }
        if(inPrint && r.selectorText && /\.qp/.test(r.selectorText)) out.push(scope(r.selectorText)+'{'+r.style.cssText+'}');
      });
    }
    Array.prototype.forEach.call(document.styleSheets, function(sh){ var rules; try{ rules=sh.cssRules; }catch(e){ return; } walk(rules, false); });
    css=out.join('\n')+'\n.q-shot{box-sizing:border-box;width:794px;padding:44px 46px 40px;background:#fff;color:#111}'
      +'\n.q-shot .qp+.qp{margin-top:40px;padding-top:32px;border-top:1px dashed #C9C4BC}'
      // 그림 도구가 글자 높이를 잴 때 쓰는 숨은 그림이 사이트 공통 img{display:block}에 걸리면 글자가 아래로 밀려 그려집니다
      +'\nbody>div[style*="visibility"]>img{display:inline!important}'
      +'\n.q-shot .qp,.q-shot .qp *{break-before:auto!important;page-break-before:auto!important;break-after:auto!important;page-break-after:auto!important}';
    return css;
  }
  function ready(img){ return img.complete && img.naturalWidth ? Promise.resolve() : new Promise(function(res){ img.onload=img.onerror=res; setTimeout(res, 3000); }); }
  function images(el){
    return Promise.all(Array.prototype.map.call(el.querySelectorAll('img'), function(img){
      return ready(img).then(function(){
        if(!/\.svg(\?|$)/i.test(img.getAttribute('src')||'') || !img.naturalWidth && !img.width) return;
        var w=Number(img.getAttribute('width'))||img.width||88, h=Number(img.getAttribute('height'))||img.height||w, c=document.createElement('canvas');
        c.width=w*3; c.height=h*3; try{ c.getContext('2d').drawImage(img,0,0,c.width,c.height); var url=c.toDataURL('image/png'); img.style.width=w+'px'; img.style.height=h+'px'; img.src=url; return ready(img); }catch(e){}
      });
    }));
  }
  function save(src, name){
    if(!src || !src.innerHTML.trim()) return Promise.reject(new Error('견적서 내용이 없습니다.'));
    var st=document.createElement('style'); st.textContent=printCss();
    var wrap=document.createElement('div'); wrap.setAttribute('aria-hidden','true'); wrap.style.cssText='position:fixed;left:-12000px;top:0;width:794px';
    var box=document.createElement('div'); box.className='q-shot'; box.innerHTML=src.innerHTML; wrap.appendChild(box);
    document.head.appendChild(st); document.body.appendChild(wrap);
    var done=function(){ st.remove(); wrap.remove(); };
    return load().then(function(h2p){
      return Promise.all([document.fonts && document.fonts.ready ? document.fonts.ready : null, images(box)]).then(function(){
        return h2p().set({ margin:0, image:{ type:'png' }, html2canvas:{ scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false }, jsPDF:{ unit:'mm', format:'a4', orientation:'portrait' } }).from(box).toCanvas().get('canvas');
      });
    }).then(function(cv){
      return new Promise(function(res,rej){ cv.toBlob(function(b){ b ? res(b) : rej(new Error('이미지를 만들지 못했습니다.')); }, 'image/png'); });
    }).then(function(blob){
      var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=String(name||'메가스팟_견적서').replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'_').replace(/_+$/,'')+'.png';
      document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      done();
    }, function(e){ done(); throw e; });
  }
  window.MEGASPOT_QUOTE_IMAGE={ save:save, css:printCss };
})();
