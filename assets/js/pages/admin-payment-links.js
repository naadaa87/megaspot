/* 관리자 결제링크 — 작성·미리보기·복사. 링크 생성은 고객에게 메시지를 보내지 않습니다. */
(function(root){
  'use strict';
  var SERVICES={rental:'대관비',catering:'출장뷔페',other:'기타 서비스'};
  var PURPOSES={deposit:'예약금',balance:'잔금',full:'전체 금액'};
  var STATUSES={open:'결제 대기',processing:'결제 진행 중',paid:'결제 완료',refunded:'취소·환불 완료',closed:'링크 종료',expired:'기한 만료',attention:'확인 필요'};
  var SPACES={'megaspot-gundae':'메가스팟 건대 1호','megaspot-gundae-2':'메가스팟 건대 2호'};
  var PRESETS={
    rental:'공간 대관 이용료 결제 안내입니다.\n사전에 안내받으신 이용일·공간·이용 시간과 상세 내역을 확인한 뒤 결제해 주세요.\n내용이 다른 경우 결제 전에 운영팀에 문의해 주세요.',
    catering:'출장뷔페 이용료 결제 안내입니다.\n사전에 협의한 행사 일시·제공 장소·식사 인원과 메뉴 구성에 대한 결제입니다.\n메뉴·구성 변경이 필요한 경우 결제 전에 운영팀에 문의해 주세요.',
    other:'서비스 이용료 결제 안내입니다.\n제공할 서비스·이용 일정·상세 내역을 확인한 뒤 결제해 주세요.'
  };
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function won(v){return Number(v||0).toLocaleString('ko-KR')+'원';}
  function kstDay(offset){return new Date(Date.now()+9*36e5+(offset||0)*864e5).toISOString().slice(0,10);}
  function kstLabel(raw,dayOnly){var value=String(raw||'');if(!value)return '—';var parsed=typeof raw==='number'?raw:Date.parse(/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)?value:value.replace(' ','T')+'Z');if(!isFinite(parsed))return '—';return new Date(parsed+9*36e5).toISOString().slice(0,dayOnly?10:16).replace('T',' ');}
  function dayValid(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
  function clean(raw,today,maxDay){
    var b={service:String(raw.service||''),purpose:String(raw.purpose||''),title:String(raw.title||'').trim(),description:String(raw.description||'').trim(),amount:Number(raw.amount)};
    function bad(field,error){return {ok:false,field:field,error:error};}
    if(!Object.prototype.hasOwnProperty.call(SERVICES,b.service))return bad('service','서비스를 선택해 주세요.');
    if(!Object.prototype.hasOwnProperty.call(PURPOSES,b.purpose))return bad('purpose','결제 구분을 선택해 주세요.');
    if(!b.title||b.title.length>100||/[\r\n\u0000-\u001f]/.test(b.title)||/(?:\b[a-z][a-z\d+.-]*:|www\.)/i.test(b.title))return bad('title','결제 제목은 링크 주소 없이 1~100자로 입력해 주세요.');
    if(!b.description||b.description.length>3000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.description))return bad('description','상세 설명은 1~3,000자로 입력해 주세요.');
    if(!Number.isSafeInteger(b.amount)||b.amount<1000||b.amount>100000000)return bad('amount','결제 금액은 1,000원부터 100,000,000원까지 원 단위로 입력해 주세요.');
    var date=String(raw.event_date||'').trim(),space=String(raw.space_id||'');
    if(date&&!dayValid(date))return bad('event_date','이용일을 확인해 주세요.');
    if(space&&!Object.prototype.hasOwnProperty.call(SPACES,space))return bad('space_id','공간을 확인해 주세요.');
    if(date)b.event_date=date;if(space)b.space_id=space;
    if(String(raw.headcount==null?'':raw.headcount).trim()){
      var people=Number(raw.headcount);if(!Number.isSafeInteger(people)||people<1||people>10000)return bad('headcount','인원은 1~10,000명 사이의 정수로 입력해 주세요.');b.headcount=people;
    }
    var start=String(raw.start_h==null?'':raw.start_h).trim(),end=String(raw.end_h==null?'':raw.end_h).trim();
    if(start||end){
      var s=Number(start),e=Number(end);
      if(!start||!end||!isFinite(s)||!isFinite(e)||s<0||s>30.5||e<=s||e>31||s*2%1||e*2%1)return bad('start_h','시작·종료 시간을 함께 선택해 주세요. 종료 시간은 시작 이후여야 합니다.');
      b.start_h=s;b.end_h=e;
    }
    var code=String(raw.booking_code||'').trim().toUpperCase();
    if(code&&!/^[A-Z0-9-]{1,40}$/.test(code))return bad('booking_code','예약번호는 영문·숫자·하이픈 40자 이내로 입력해 주세요.');
    if(code)b.booking_code=code;
    var expires=String(raw.expires_on||'').trim();
    if(!dayValid(expires)||(today&&expires<today)||(maxDay&&expires>maxDay))return bad('expires_on','링크 유효기간은 오늘부터 90일 이내로 선택해 주세요.');
    b.expires_on=expires;return {ok:true,body:b};
  }
  function safeUrl(raw,origin){
    try{var u=new URL(raw,origin);if((u.origin!==origin&&u.origin!=='https://megaspot.kr')||!/^https?:$/.test(u.protocol)||u.username||u.password||!/^\/payment\/?$/.test(u.pathname)||!u.searchParams.get('link')||u.hash)return '';return u.href;}catch(e){return '';}
  }
  function createFlow(send,uuid,busy){
    var pending=false,signature='',requestId='';
    return {
      reset:function(){if(!pending){signature='';requestId='';}},
      submit:function(body){
        if(pending)return Promise.resolve(null);
        var next=JSON.stringify(body);
        try{if(next!==signature){requestId=uuid();signature=next;}}catch(error){return Promise.reject(error);}
        var payload=Object.assign({request_id:requestId},body);
        pending=true;busy(true);
        return Promise.resolve().then(function(){return send(payload);}).finally(function(){pending=false;busy(false);});
      }
    };
  }
  function timeText(h){if(h==null||h==='')return '';var n=Number(h);return (n>=24?'다음 날 ':'')+String(Math.floor(n%24)).padStart(2,'0')+':'+(n%1?'30':'00');}
  function preview(body){
    var meta=[];
    if(body.event_date)meta.push(['이용일',body.event_date]);
    if(body.space_id)meta.push(['이용 공간',SPACES[body.space_id]||body.space_id]);
    if(body.start_h!==undefined&&body.end_h!==undefined)meta.push(['이용 시간',timeText(body.start_h)+' ~ '+timeText(body.end_h)]);
    if(body.headcount)meta.push(['이용 인원',body.headcount+'명']);
    return '<div class="apl-customer-brand"><img src="/assets/img/brand/megaspot-official-wordmark-transparent.png" alt="메가스팟 MEGASPOT" width="170" height="56"><span>결제 안내</span></div>'
      +'<div class="apl-preview-tags"><span>'+esc(SERVICES[body.service]||'서비스')+'</span><span>'+esc(PURPOSES[body.purpose]||'전체 금액')+'</span></div>'
      +'<h3>'+esc(body.title||'고객에게 보낼 결제 제목')+'</h3>'
      +'<div class="apl-preview-amount"><small>결제할 금액</small><strong>'+esc(won(body.amount))+'</strong></div>'
      +(body.description?'<p class="apl-preview-description">'+esc(body.description)+'</p>':'')
      +(meta.length?'<dl class="apl-preview-meta">'+meta.map(function(x){return '<div><dt>'+esc(x[0])+'</dt><dd>'+esc(x[1])+'</dd></div>';}).join('')+'</dl>':'')
      +(body.purpose==='deposit'?'<p class="apl-preview-note">예약금은 이용료의 일부입니다. 이용 후 반환하는 보증금과 다릅니다.</p>':'')
      +'<div class="apl-preview-pay" aria-hidden="true">'+esc(won(body.amount))+' 결제하기</div><p class="apl-preview-caption">작성 내용 미리보기 · 실제 결제는 생성한 링크에서 진행합니다.</p>';
  }
  var helpers={clean:clean,createFlow:createFlow,safeUrl:safeUrl,preview:preview,kstLabel:kstLabel,STATUSES:STATUSES};
  if(typeof module==='object'&&module.exports){module.exports=helpers;return;}
  var X=root.MEGASPOT_ADMIN,M=root.MEGASPOT;
  if(!X||!M||typeof document==='undefined')return;
  var main=document.querySelector('.adm-main');if(!main)return;
  var V=document.createElement('section');V.id='view-payment-links';V.className='adm-view apl-view';V.hidden=true;
  function opts(map){return Object.keys(map).map(function(k){return '<option value="'+k+'">'+esc(map[k])+'</option>';}).join('');}
  function hourOptions(end){var html='<option value="">선택 안 함</option>';for(var n=0;n<=31;n+=0.5){if(!end&&n===31)continue;html+='<option value="'+n+'">'+timeText(n)+'</option>';}return html;}
  V.innerHTML='<header class="adm-head"><div><h1>결제링크 생성</h1><p class="small muted">대관비·출장뷔페 등의 결제 금액과 상세 설명을 정하고 고객에게 전달할 링크를 만듭니다.</p></div><span id="apl-payment-state" class="apl-connection">결제 연결 확인 중</span></header>'
    +'<div class="apl-editor"><form id="apl-form" class="adm-card apl-form" novalidate><div class="apl-card-head"><div><h2>받을 금액과 내용</h2><p class="small muted">링크를 만들면 아래 최근 목록에 저장됩니다.</p></div><button type="button" class="btn btn-light btn-sm" id="apl-new">새 양식</button></div>'
    +'<div class="apl-fields"><label>서비스<select class="select" name="service">'+opts(SERVICES)+'</select></label><label>결제 구분<select class="select" name="purpose">'+opts(PURPOSES)+'</select></label></div>'
    +'<p class="apl-help" id="apl-purpose-help">예약금은 이용료의 일부이며, 이용 후 반환하는 보증금과 다릅니다.</p>'
    +'<label class="apl-field">결제 제목 <span class="apl-required">필수</span><input class="input" name="title" maxlength="100" placeholder="예: 메가스팟 건대 1호 대관비 예약금" required></label>'
    +'<label class="apl-field">결제 받을 금액 <span class="apl-required">필수</span><span class="apl-money-input"><input class="input" name="amount" type="number" inputmode="numeric" min="1000" max="100000000" step="1" placeholder="예: 300000" required><span>원</span></span></label>'
    +'<p class="apl-help">고객이 실제 결제할 최종 금액(부가세 포함)을 입력해 주세요.</p>'
    +'<div class="apl-description-head"><label for="apl-description">상세 설명 <span class="apl-required">필수</span></label><button type="button" class="btn btn-light btn-xs" id="apl-preset">기본 설명 적용</button></div><textarea class="input" id="apl-description" name="description" rows="7" maxlength="3000" placeholder="제공할 내용·금액 구성·유의사항을 적어 주세요." required></textarea><p class="apl-help">고객에게 공개할 내용만 입력해 주세요.</p>'
    +'<details class="apl-details"><summary>이용 정보 · 예약 연결 <span>선택</span></summary><div class="apl-fields"><label>이용일<input class="input" type="date" name="event_date"></label><label>이용 공간<select class="select" name="space_id"><option value="">선택 안 함</option>'+opts(SPACES)+'</select></label><label>시작 시간<select class="select" name="start_h">'+hourOptions(false)+'</select></label><label>종료 시간<select class="select" name="end_h">'+hourOptions(true)+'</select></label><label>이용 인원<input class="input" name="headcount" type="number" min="1" max="10000" step="1" placeholder="예: 50"></label><label>연결할 예약번호<input class="input" name="booking_code" maxlength="40" autocomplete="off" placeholder="예: BK-…"></label></div><p class="apl-help">대관비에 예약번호를 연결하면 해당 예약의 이용료 수납에 반영됩니다. 출장뷔페·기타 서비스는 별도 결제로 기록됩니다. 링크 생성만으로 새 예약이 확정되지는 않습니다.</p></details>'
    +'<label class="apl-field">링크 유효기간 (한국시간) <span class="apl-required">필수</span><input class="input" type="date" name="expires_on" required></label><p class="apl-help">기본 7일 · 최대 90일. 기한이 지나면 고객이 결제를 시작할 수 없습니다.</p>'
    +'<p id="apl-error" class="apl-error" role="alert" hidden></p><div class="apl-submit-row"><button class="btn btn-primary" id="apl-create" type="submit">결제링크 생성</button><span id="apl-save-state" class="small" role="status"></span></div><p class="apl-help">문자·카카오톡은 자동으로 발송하지 않습니다. 만든 링크를 복사해 직접 전달해 주세요.</p></form>'
    +'<aside class="apl-preview-wrap"><div class="apl-preview-heading"><h2>고객 화면 미리보기</h2><span>입력하면 바로 반영됩니다</span></div><div id="apl-preview" class="apl-preview" aria-label="고객 결제 안내 미리보기"></div></aside></div>'
    +'<section id="apl-created" class="adm-card apl-created" hidden aria-live="polite"><h2>전달할 링크가 준비되었습니다</h2><p class="small muted">아래 링크를 복사해 고객에게 전달해 주세요. 새 링크가 필요하면 ‘새 양식’을 눌러 주세요.</p><label class="apl-field">고객 결제 링크<input id="apl-created-url" class="input" readonly></label><div class="apl-actions"><button type="button" class="btn btn-primary btn-sm" id="apl-copy-created">링크 복사</button><a class="btn btn-light btn-sm" id="apl-open-created" target="_blank" rel="noopener noreferrer">고객 화면 열기 ↗</a><span id="apl-copy-state" class="small" role="status"></span></div></section>'
    +'<section class="apl-history"><div class="apl-history-head"><div><h2>최근 결제링크</h2><p class="small muted">고객 결제 상태를 확인하고 링크를 다시 복사할 수 있습니다. 날짜·시간은 한국 기준입니다.</p></div><button type="button" class="btn btn-light btn-sm" id="apl-refresh">새로고침</button></div><p id="apl-list-state" class="small muted" role="status"></p><div id="apl-list" class="apl-list"></div></section>';
  main.appendChild(V);
  var q=function(s){return V.querySelector(s);},form=q('#apl-form'),items=[],loadSeq=0,lastTitle='',lastPreset='',saving=false;
  function values(){var out={};['service','purpose','title','description','amount','event_date','space_id','start_h','end_h','headcount','booking_code','expires_on'].forEach(function(k){out[k]=form.elements[k].value;});return out;}
  function repaint(){var b=values();b.amount=Number(b.amount)||0;if(b.start_h==='')delete b.start_h;if(b.end_h==='')delete b.end_h;q('#apl-preview').innerHTML=preview(b);q('#apl-purpose-help').hidden=b.purpose!=='deposit';}
  function autoTitle(){var next='메가스팟 '+SERVICES[form.elements.service.value]+' '+PURPOSES[form.elements.purpose.value];if(!form.elements.title.value||form.elements.title.value===lastTitle)form.elements.title.value=next;lastTitle=next;}
  function applyPreset(force){var el=form.elements.description;if(force||!el.value||el.value===lastPreset)el.value=PRESETS[form.elements.service.value];lastPreset=PRESETS[form.elements.service.value];}
  function reset(){
    form.reset();form.elements.service.value='rental';form.elements.purpose.value='deposit';form.elements.expires_on.value=kstDay(7);form.elements.expires_on.min=kstDay();form.elements.expires_on.max=kstDay(90);
    lastTitle='';lastPreset='';autoTitle();applyPreset(true);creator.reset();q('#apl-error').hidden=true;q('#apl-save-state').textContent='';q('#apl-created').hidden=true;repaint();
  }
  function setBusy(on){saving=on;form.setAttribute('aria-busy',String(on));form.querySelectorAll('input,select,textarea,button').forEach(function(el){el.disabled=on;});q('#apl-create').textContent=on?'링크 저장 중…':'결제링크 생성';q('#apl-save-state').textContent=on?'저장하고 있습니다. 잠시 기다려 주세요.':'';}
  function uuid(){return root.crypto.randomUUID();}
  var creator=createFlow(function(body){return X.A('/payment-links',{method:'POST',body:body});},uuid,setBusy);
  function showError(error,field){q('#apl-error').textContent=error;q('#apl-error').hidden=false;if(field&&form.elements[field])form.elements[field].focus();}
  function copy(url,status,input){
    status.textContent='';
    if(!url){status.textContent='복사할 링크를 확인해 주세요.';return;}
    var promise=root.navigator.clipboard?root.navigator.clipboard.writeText(url):Promise.reject();
    promise.then(function(){status.textContent='링크를 복사했습니다.';}).catch(function(){status.textContent='링크를 선택한 뒤 직접 복사해 주세요.';if(input){input.focus();input.select();}});
  }
  function row(link){
    var url=safeUrl(link.url,root.location.origin),status=STATUSES[link.status]||'상태 확인 필요',meta=[SERVICES[link.service]||'기타 서비스',PURPOSES[link.purpose]||'전체 금액'];
    if(link.event_date)meta.push(link.event_date);if(link.space_name||SPACES[link.space_id])meta.push(link.space_name||SPACES[link.space_id]);if(link.booking_code)meta.push('예약 '+link.booking_code);
    return '<article class="adm-card apl-link-row" data-link-id="'+esc(link.id)+'"><div class="apl-link-top"><div><span class="apl-status apl-status-'+esc(Object.prototype.hasOwnProperty.call(STATUSES,link.status)?link.status:'attention')+'">'+esc(status)+'</span><h3>'+esc(link.title)+'</h3><p class="small muted">'+meta.map(esc).join(' · ')+'</p></div><strong class="apl-link-amount">'+esc(won(link.amount))+'</strong></div>'
      +'<p class="apl-link-dates">생성 '+esc(kstLabel(link.created_at,false))+' · 만료 '+esc(kstLabel(link.expires_at,true))+(link.order_oid?' · 주문 '+esc(link.order_oid):'')+'</p>'
      +(url?'<label class="apl-sr-only" for="apl-url-'+esc(link.id)+'">고객 결제 링크</label><input id="apl-url-'+esc(link.id)+'" class="input apl-row-url" readonly value="'+esc(url)+'"><div class="apl-actions"><button type="button" class="btn btn-light btn-sm" data-apl="copy">링크 복사</button><a class="btn btn-light btn-sm" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">고객 화면 열기 ↗</a>'+(link.can_close===true?'<button type="button" class="btn btn-light btn-sm apl-close" data-apl="ask-close">링크 종료</button>':'')+'</div>':'<p class="apl-error">고객 링크 주소를 확인하지 못했습니다. 새로고침해 주세요.</p>')
      +'<div class="apl-close-confirm" hidden><p>링크를 종료하면 고객이 결제를 시작할 수 없습니다. 종료할까요?</p><button type="button" class="btn btn-primary btn-sm" data-apl="close">종료하기</button> <button type="button" class="btn btn-light btn-sm" data-apl="keep">계속 사용</button></div><p class="apl-row-state small" role="status"></p></article>';
  }
  function drawList(){q('#apl-list').innerHTML=items.length?items.map(row).join(''):'<div class="adm-card apl-empty">아직 생성한 결제링크가 없습니다. 위에서 받을 금액과 내용을 입력해 주세요.</div>';}
  function load(){
    var seq=++loadSeq;q('#apl-refresh').disabled=true;q('#apl-refresh').textContent='불러오는 중…';q('#apl-list-state').textContent='최근 결제링크를 불러오는 중…';
    return X.A('/payment-links').then(function(r){if(seq!==loadSeq)return;items=r.items||[];drawList();q('#apl-list-state').textContent=items.length+'개 링크';var p=r.payment||{},state=q('#apl-payment-state');state.textContent=p.enabled?'온라인 결제 연결됨':'온라인 결제 연결 확인 필요';state.classList.toggle('is-ready',!!p.enabled);}).catch(function(e){if(seq===loadSeq&&!X.guard(e))q('#apl-list-state').textContent=e.message||'링크를 불러오지 못했습니다. 새로고침해 주세요.';}).finally(function(){if(seq===loadSeq){q('#apl-refresh').disabled=false;q('#apl-refresh').textContent='새로고침';}});
  }
  form.addEventListener('input',function(){creator.reset();q('#apl-error').hidden=true;repaint();});
  form.addEventListener('change',function(e){creator.reset();if(e.target.name==='service'){autoTitle();applyPreset(false);}if(e.target.name==='purpose')autoTitle();repaint();});
  q('#apl-preset').addEventListener('click',function(){creator.reset();applyPreset(true);repaint();});
  q('#apl-new').addEventListener('click',function(){if(!saving){reset();form.elements.title.focus();}});
  form.addEventListener('submit',function(e){
    e.preventDefault();if(saving)return;q('#apl-error').hidden=true;
    var result=clean(values(),kstDay(),kstDay(90));if(!result.ok){showError(result.error,result.field);return;}
    creator.submit(result.body).then(function(r){
      if(!r)return;var url=r.link&&safeUrl(r.link.url,root.location.origin);if(!url)throw Error('링크는 저장되었지만 주소를 확인하지 못했습니다. 최근 결제링크를 새로고침해 주세요.');
      q('#apl-created-url').value=url;q('#apl-open-created').href=url;q('#apl-copy-state').textContent='';q('#apl-created').hidden=false;q('#apl-save-state').textContent='링크를 저장했습니다.';
      load();
    }).catch(function(error){if(!X.guard(error))showError(error.message||'저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 눌러 확인해 주세요.');});
  });
  q('#apl-copy-created').addEventListener('click',function(){copy(q('#apl-created-url').value,q('#apl-copy-state'),q('#apl-created-url'));});
  q('#apl-refresh').addEventListener('click',load);
  q('#apl-list').addEventListener('click',function(e){
    var button=e.target.closest('[data-apl]');if(!button)return;var card=button.closest('[data-link-id]');if(!card)return;
    var link=items.filter(function(item){return String(item.id)===card.dataset.linkId;})[0],status=card.querySelector('.apl-row-state'),panel=card.querySelector('.apl-close-confirm');if(!link)return;
    if(button.dataset.apl==='copy'){copy(safeUrl(link.url,root.location.origin),status,card.querySelector('.apl-row-url'));return;}
    if(button.dataset.apl==='ask-close'){if(link.can_close===true){panel.hidden=false;status.textContent='';}return;}
    if(button.dataset.apl==='keep'){panel.hidden=true;return;}
    if(button.dataset.apl!=='close'||link.can_close!==true||card.getAttribute('aria-busy')==='true')return;
    card.setAttribute('aria-busy','true');card.querySelectorAll('button').forEach(function(b){b.disabled=true;});status.textContent='링크를 종료하고 있습니다…';
    X.A('/payment-links/'+encodeURIComponent(link.id)+'/close',{method:'POST',body:{}}).then(function(){link.status='closed';link.can_close=false;drawList();q('#apl-list-state').textContent='링크를 종료했습니다.';}).catch(function(error){if(!X.guard(error))status.textContent=error.message||'링크를 종료하지 못했습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.';}).finally(function(){card.removeAttribute('aria-busy');card.querySelectorAll('button').forEach(function(b){b.disabled=false;});});
  });
  reset();X.register('payment-links',load);
  if(X.visible()&&X.current()==='payment-links')X.go('payment-links');
})(typeof window==='object'?window:globalThis);
