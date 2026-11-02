/* Read-only summary of the saved room and food estimates. Never changes billing totals. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MEGASPOT_INQUIRY_OVERVIEW=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function amount(v){return v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;}
  function money(v){return Number(v).toLocaleString('ko-KR')+'원';}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  // Earlier inquiries saved reception selections in message / summary, rather than a separate object.
  function reception(d){
    var line=String(d.summary||'').split('\n').find(function(s){return /^도시락·핑거푸드[^\n]*: (?:[\d,]+원|상담 후 안내)/.test(s);});
    if(line){var m=line.match(/^(.*?): ([\d,]+원|상담 후 안내)(?: \((.*)\))?$/);if(m)return {title:'도시락·핑거푸드 케이터링',detail:m[1].replace(/^도시락·핑거푸드 /,''),amount:m[2]==='상담 후 안내'?null:amount(m[2].replace(/[,원]/g,'')),note:m[3]||'부가세·최소 주문 조건 확인 필요',uncertain:true};}
    var text=String(d.message||''),start=text.indexOf('[출장 케이터링 클래식 상담]');
    if(start>=0){
      var block=text.slice(start).split(/\n\s*\n/)[0],price=block.match(/· 예상 금액: ([\d,]+)원/);
      return {title:'도시락·핑거푸드 케이터링',detail:block.split('\n').filter(function(s){return /희망 제공 방식:|· 인원:|· 메뉴:|· 출장/.test(s);}).join('\n')||'클래식 상담',amount:price?amount(price[1].replace(/,/g,'')):null,note:'부가세·최소 주문 조건 확인 필요',uncertain:true};
    }
    var request=text.match(/^(?:도시락·핑거푸드 케이터링 (?:코스 미정|라이트|프리미엄|시그니처) · \d+명 · [^\n]*|출장 케이터링 클래식 \d+명 구성의 별도 견적을 상담받고 싶습니다\.)/m);
    if(request)return {title:'도시락·핑거푸드 케이터링',detail:request[0],amount:null,note:'상담 후 견적',uncertain:true};
    return null;
  }
  function build(it,opts){
    opts=opts||{};var d=it.data||{},rows=[],room=amount(opts.roomAmount);
    rows.push({title:'공간 대관',detail:opts.spaceName||d.space_id||it.space_id||'공간 미정',amount:room,note:[opts.conditions,opts.roomNote||'현재 공간 금액 기준 · 식음료 별도'].filter(Boolean).join('\n')});
    var c=d.catering;
    if(c){var cancelled=c.status==='cancelled',status={pending:'확정 대기',confirmed:'확정',ordered:'발주 완료',completed:'제공 완료',cancelled:'취소'}[c.status]||c.status;
      rows.push({title:'출장뷔페',detail:c.summary?String(c.summary).replace(/\s*—\s*예상.*$/,''): [c.course_name||'코스 상담 후 결정',c.people?c.people+'명':'',c.bbq_name?'바베큐 '+c.bbq_name:'',c.beer?'생맥주 '+c.beer+'통':''].filter(Boolean).join(' · '),amount:amount(c.total),cancelled:cancelled,
        note:[status?'진행 상태: '+status:'',c.total>0?'부가세·출장·세팅비 포함':'코스·인원 상담 후 견적',c.meal_time?'식사 시간 '+c.meal_time:'',c.note?'메모: '+c.note:''].filter(Boolean).join('\n')});
      // A zero from an undecided buffet is a missing quote, rather than a free service.
      if(!c.course&&!c.bbq&&!c.beer&&!c.total)rows[rows.length-1].amount=null;
    }
    var rec=reception(d);if(rec)rows.push(rec);
    var ck=d.cocktail;
    if(ck){var names=opts.cocktailNames||{},menus=(Array.isArray(ck.menus)?ck.menus:[]).map(function(id){return names[id]||id;});
      rows.push({title:'출장 칵테일',detail:[ck.cups?ck.cups+'잔 패키지':'패키지 상담 후 결정',menus.length?'희망 메뉴: '+menus.join(', '):'',ck.nonalcohol?'논알코올 구성 상담':'',ck.note?'요청: '+ck.note:''].filter(Boolean).join('\n'),amount:amount(ck.price),note:'부가세·출장·운영 조건 확인 전',uncertain:true});
    }
    var active=rows.filter(function(r){return !r.cancelled;}),total=active.reduce(function(sum,r){return sum+(r.amount===null?0:r.amount);},0);
    return {rows:rows,total:total,hasAmount:active.some(function(r){return r.amount!==null;}),incomplete:active.some(function(r){return r.amount===null||r.uncertain;}),pending:active.filter(function(r){return r.amount===null;}).map(function(r){return r.title;}),hasCatering:!!c};
  }
  function render(m){
    return '<section class="dr-sec dr-plan" aria-label="공간·식음료 견적 요약"><div class="dr-plan-heading"><h3>공간·식음료 견적 요약</h3><span>현재 저장된 구성 기준</span></div>'
      +'<div class="dr-plan-rows">'+m.rows.map(function(r){return '<div class="dr-plan-row'+(r.cancelled?' is-cancelled':'')+'"><div class="dr-plan-desc"><h4>'+esc(r.title)+(r.cancelled?' <span>취소 · 합계 제외</span>':'')+'</h4><p>'+esc(r.detail)+'</p><small>'+esc(r.note)+'</small></div><b class="dr-plan-price">'+esc(r.amount===null?'상담 후 안내':money(r.amount))+'</b></div>';}).join('')+'</div>'
      +(m.rows.length===1?'<p class="dr-plan-empty">선택한 식음료가 없습니다.</p>':'')
      +'<div class="dr-plan-total"><span>'+(m.incomplete?'계산 가능한 소계':'전체 예상 견적')+'</span><strong>'+(m.hasAmount?esc(money(m.total)):'상담 후 안내')+'</strong></div>'
      +'<p class="dr-plan-note">'+(m.pending.length?esc(m.pending.join(' · '))+' 금액은 미정이며 소계에 포함되지 않았습니다. ':'')+(m.incomplete?'미확정 부가세·출장·운영 조건은 상담 후 최종 확인합니다. ':'')+'반환 보증금은 합계에서 제외됩니다. 공간 금액을 수정하면 합계에도 반영됩니다.</p>'
      +(m.hasCatering?'<button type="button" class="btn btn-light btn-xs" id="dr-cat-go">출장뷔페 구성 관리 →</button>':'')+'</section>';
  }
  return {build:build,render:render,reception:reception};
});
