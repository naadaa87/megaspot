/* =====================================================================
   행사 문의서 (견적 문의) 컴포넌트
   - MEGASPOT.renderInquiry(container, { spaceId, mode:'space'|'request', prefill:{...} })
   - API 연결 시 /api/inquiry 로 저장, 미연결 시 체험 모드(문의 내용 복사·문자·이메일 전송)로 전환
   ===================================================================== */
(function(){
  var M=window.MEGASPOT, esc=M.esc;
  var PUR=window.MEGASPOT_PURPOSES||[], SP=window.MEGASPOT_SPACES||[], REG=window.MEGASPOT_REGIONS||[];
  var LAYOUTS=[['lecture','강연형 (스크린을 향한 좌석)'],['classroom','책상형 (테이블 + 좌석)'],['banquet','연회형 (긴 테이블 식사)'],['standing','교류형 (스탠딩·라운지)'],['undecided','미정 · 상담 후 결정']];
  var NEEDS=[['screen','200인치 스크린·프로젝터'],['mic','무선마이크·음향'],['laptop','노트북 연결(HDMI 등)'],['power','전원·멀티탭'],['food','외부 음식 반입'],['catering','케이터링 업체 이용'],['alcohol','주류 반입'],['deco','장식·설치물'],['fx','연출 장비(스모그·LED)'],['camera','촬영 장비 반입'],['parking','주차'],['lift','엘리베이터 반입']];
  var BUDGET=[['','미정 · 견적을 보고 판단'],['~100','100만원 이하'],['100-200','100~200만원'],['200-300','200~300만원'],['300-500','300~500만원'],['500+','500만원 이상']];
  var SLOTS=[['am','오전 09–13시'],['pm','오후 14–18시'],['ev','저녁 19–23시'],['day','종일'],['custom','직접 입력']];

  function opt(list, sel){ return list.map(function(p){ var v=p[0]!==undefined&&Array.isArray(p)?p[0]:p.id, l=Array.isArray(p)?p[1]:p.label; return '<option value="'+esc(v)+'"'+(String(sel)===String(v)?' selected':'')+'>'+esc(l)+'</option>'; }).join(''); }

  function template(o){
    var isReq = o.mode==='request';
    var spaceOpts = '<option value="">선택</option>' + SP.filter(function(s){return s.status==='open';}).map(function(s){ return '<option value="'+s.id+'"'+(o.spaceId===s.id?' selected':'')+'>'+esc(s.name)+' · '+esc(s.typeLabel)+'</option>'; }).join('') + '<option value="request"'+(isReq?' selected':'')+'>조건에 맞는 공간을 찾아 주세요</option>';
    var pf=o.prefill||{};
    return ''
    + '<form class="form card" id="inquiry-form" novalidate>'
    + '<div><div class="eyebrow">Event inquiry</div><h3 class="h-m mt-1">행사 문의서</h3><p class="small muted mt-1">확인되지 않은 내용을 추정해 채우지 않습니다. 모르는 항목은 비워 두셔도 됩니다. <span class="req">*</span> 표시는 필수입니다.</p></div>'

    + '<fieldset style="border:0;padding:0;margin:0;display:grid;gap:14px"><legend class="kicker">행사 기본</legend>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-space">희망 공간 <span class="req">*</span></label><select class="select" id="iq-space" name="space_id" required>'+spaceOpts+'</select></div>'
    + '<div class="f"><label for="iq-purpose">행사 목적 <span class="req">*</span></label><select class="select" id="iq-purpose" name="purpose" required><option value="">선택</option>'+opt(PUR, pf.purpose)+'<option value="other"'+(pf.purpose==='other'?' selected':'')+'>기타</option></select></div>'
    + '</div>'
    + '<div class="field-row" id="iq-region-row"'+(isReq?'':' hidden')+'>'
    + '<div class="f"><label for="iq-region">희망 지역</label><select class="select" id="iq-region" name="region"><option value="">무관</option>'+opt(REG, pf.region)+'</select></div>'
    + '<div class="f"><label for="iq-theme">원하는 분위기·조건</label><input class="input" id="iq-theme" name="theme" placeholder="예: 밝은 홀, 무대 설치, 야외 공간"></div>'
    + '</div>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-date">희망 날짜 <span class="req">*</span></label><input class="input" type="date" id="iq-date" name="date" value="'+esc(pf.date||'')+'" required><span class="hint">정해지지 않았다면 가장 가능성 높은 날을 적어 주세요.</span></div>'
    + '<div class="f"><label for="iq-date2">대체 가능일</label><input class="input" type="date" id="iq-date2" name="date_alt"></div>'
    + '</div></fieldset>'

    + '<fieldset style="border:0;padding:0;margin:0;display:grid;gap:14px"><legend class="kicker">시간</legend>'
    + '<div class="f"><span class="lbl">시간대 <span class="req">*</span></span><div class="seg" id="iq-slot">'+SLOTS.map(function(s,i){ return '<button type="button" data-v="'+s[0]+'"'+(i===1?' class="on"':'')+'>'+esc(s[1])+'</button>'; }).join('')+'</div><input type="hidden" name="slot" value="pm"></div>'
    + '<div class="field-row" id="iq-times" hidden>'
    + '<div class="f"><label for="iq-t1">준비 시작</label><input class="input" type="time" id="iq-t1" name="t_setup"></div>'
    + '<div class="f"><label for="iq-t2">행사 시작</label><input class="input" type="time" id="iq-t2" name="t_start"></div>'
    + '<div class="f"><label for="iq-t3">행사 종료</label><input class="input" type="time" id="iq-t3" name="t_end"></div>'
    + '<div class="f"><label for="iq-t4">철수 완료</label><input class="input" type="time" id="iq-t4" name="t_out"></div>'
    + '</div>'
    + '<p class="hint">준비·철수 시간은 이용 시간에 포함해 산정합니다. 기본 시간대로 문의하셔도 상담 때 함께 조정합니다.</p>'
    + '</fieldset>'

    + '<fieldset style="border:0;padding:0;margin:0;display:grid;gap:14px"><legend class="kicker">인원과 배치</legend>'
    + '<div class="field-row three">'
    + '<div class="f"><label for="iq-people">참석자 수 <span class="req">*</span></label><input class="input" type="number" min="1" max="999" id="iq-people" name="headcount" value="'+esc(pf.people||'')+'" placeholder="예: 80" required></div>'
    + '<div class="f"><label for="iq-staff">진행자·스태프</label><input class="input" type="number" min="0" max="99" id="iq-staff" name="staff" placeholder="예: 4"></div>'
    + '<div class="f"><label for="iq-layout">배치 형태</label><select class="select" id="iq-layout" name="layout">'+opt(LAYOUTS,'undecided')+'</select></div>'
    + '</div></fieldset>'

    + '<fieldset style="border:0;padding:0;margin:0;display:grid;gap:14px"><legend class="kicker">필수 조건</legend>'
    + '<div class="checks">'+NEEDS.map(function(n){ return '<label class="chk"><input type="checkbox" name="needs" value="'+n[0]+'"> '+esc(n[1])+'</label>'; }).join('')+'</div>'
    + '<div class="f"><label for="iq-food">음식·연출 계획</label><input class="input" id="iq-food" name="food_fx" placeholder="예: 도시락 80개 반입, 음료 셀프바, 포토월 설치 예정"></div>'
    + '</fieldset>'

    + '<fieldset style="border:0;padding:0;margin:0;display:grid;gap:14px"><legend class="kicker">예산과 연락처</legend>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-budget">총예산 (선택)</label><select class="select" id="iq-budget" name="budget">'+opt(BUDGET,'')+'</select><span class="hint">공간료 외 장비·인력·청소 포함 여부는 견적서에서 구분합니다.</span></div>'
    + '<div class="f"><span class="lbl">서류 필요</span><div class="checks"><label class="chk"><input type="checkbox" name="docs" value="quote"> 견적서</label><label class="chk"><input type="checkbox" name="docs" value="tax"> 세금계산서</label><label class="chk"><input type="checkbox" name="docs" value="receipt"> 증빙 서류</label></div></div>'
    + '</div>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-name">이름 · 소속 <span class="req">*</span></label><input class="input" id="iq-name" name="name" placeholder="예: 김민지 · ○○ 커뮤니티" required></div>'
    + '<div class="f"><label for="iq-phone">연락처 <span class="req">*</span></label><input class="input" type="tel" id="iq-phone" name="phone" placeholder="010-0000-0000" required></div>'
    + '</div>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-email">이메일</label><input class="input" type="email" id="iq-email" name="email" placeholder="견적서를 받을 주소"></div>'
    + '<div class="f"><label for="iq-contact">선호 연락 방법</label><select class="select" id="iq-contact" name="contact_pref"><option value="phone">전화</option><option value="sms">문자</option><option value="email">이메일</option><option value="kakao">카카오톡</option></select></div>'
    + '</div>'
    + '<div class="f"><label for="iq-msg">요청사항</label><textarea class="textarea" id="iq-msg" name="message" maxlength="2000" placeholder="행사 흐름, 꼭 필요한 조건, 걱정되는 점을 자유롭게 적어 주세요."></textarea></div>'
    + '</fieldset>'

    + '<label class="agree"><input type="checkbox" name="agree_privacy" required> <span>(필수) 문의 응대와 견적 안내를 위해 이름·연락처·이메일·행사 정보를 수집·이용하는 데 동의합니다. 보유 기간은 문의 처리 완료 후 1년이며, <a href="/privacy/" style="text-decoration:underline">개인정보처리방침</a>을 따릅니다.</span></label>'
    + '<label class="agree"><input type="checkbox" name="agree_marketing"> <span>(선택) 공간 소식과 빈 시간대 안내를 받겠습니다.</span></label>'
    + '<div class="form-note">문의 완료는 예약 확정이 아닙니다. 조건을 확인한 뒤 견적과 일정 확보 여부를 안내드리며, 결제가 완료되어야 예약이 확정됩니다.</div>'
    + '<div id="iq-error" class="err" hidden></div>'
    + '<button class="btn btn-primary btn-lg" type="submit" id="iq-submit">행사 조건으로 견적 문의 <span class="arrow">→</span></button>'
    + '</form>'
    + '<div id="iq-done" hidden></div>';
  }

  function label(list, v){ for(var i=0;i<list.length;i++){ var k=Array.isArray(list[i])?list[i][0]:list[i].id; if(String(k)===String(v)) return Array.isArray(list[i])?list[i][1]:list[i].label; } return v||''; }

  function summary(d){
    var sp = SP.find(function(s){return s.id===d.space_id;});
    var lines=[];
    lines.push('[메가스팟 행사 문의]');
    lines.push('희망 공간: '+(sp?sp.name:(d.space_id==='request'?'조건에 맞는 공간 요청':d.space_id)));
    if(d.region) lines.push('희망 지역: '+label(REG,d.region));
    lines.push('행사 목적: '+(d.purpose==='other'?'기타':label(PUR,d.purpose)));
    lines.push('희망 날짜: '+(d.date||'-')+(d.date_alt?' (대체 '+d.date_alt+')':''));
    var slot=label(SLOTS,d.slot); if(d.slot==='custom'){ slot='준비 '+(d.t_setup||'-')+' / 행사 '+(d.t_start||'-')+'–'+(d.t_end||'-')+' / 철수 '+(d.t_out||'-'); }
    lines.push('시간: '+slot);
    lines.push('인원: 참석 '+(d.headcount||'-')+'명'+(d.staff?' + 스태프 '+d.staff+'명':''));
    lines.push('배치: '+label(LAYOUTS,d.layout));
    var needs=[].concat(d.needs||[]).map(function(v){return label(NEEDS,v);}); if(needs.length) lines.push('필수 조건: '+needs.join(', '));
    if(d.food_fx) lines.push('음식·연출: '+d.food_fx);
    if(d.theme) lines.push('원하는 조건: '+d.theme);
    if(d.budget) lines.push('총예산: '+label(BUDGET,d.budget));
    var docs=[].concat(d.docs||[]).map(function(v){return {quote:'견적서',tax:'세금계산서',receipt:'증빙 서류'}[v]||v;}); if(docs.length) lines.push('서류: '+docs.join(', '));
    lines.push('연락: '+(d.name||'')+' / '+(d.phone||'')+(d.email?' / '+d.email:'')+' / 선호 '+({phone:'전화',sms:'문자',email:'이메일',kakao:'카카오톡'}[d.contact_pref]||''));
    if(d.message) lines.push('요청사항: '+d.message);
    return lines.join('\n');
  }

  function donePanel(ref, d, live){
    var text=summary(d);
    var smsBody=encodeURIComponent(text), mailBody=encodeURIComponent(text);
    var phone=M.CONFIG.phone.replace(/-/g,''), email=M.CONFIG.email;
    var html='<div class="card" style="border-color:var(--cobalt)">'
      + '<div class="row between"><div class="eyebrow">'+(live?'Received':'Draft ready')+'</div><span class="badge '+(live?'badge-ok':'badge-warn')+'">'+(live?'문의 접수 완료':'체험 모드 · 전송 대기')+'</span></div>'
      + '<h3 class="h-m mt-1">'+(live?'문의가 접수되었습니다':'문의 내용이 준비되었습니다')+'</h3>'
      + '<p class="mt-2" style="font-size:15px">문의번호 <b style="font-family:var(--font-display);font-size:22px;letter-spacing:.02em;color:var(--cobalt)">'+esc(ref)+'</b></p>'
      + (live
          ? '<p class="small muted mt-1">접수 즉시 자동 안내가 발송되며, 영업시간 내 문의는 2시간 이내 첫 답변, 조건이 갖춰진 문의는 1영업일 안에 견적을 드리는 것을 목표로 합니다. 문의 완료는 예약 확정이 아니며, 견적 수락과 결제가 끝나야 일정이 확정됩니다.</p>'
          : '<p class="small muted mt-1">지금은 서버 데이터베이스가 연결되지 않아 문의가 자동 저장되지 않습니다. 아래 내용을 복사하거나 문자·이메일로 바로 보내 주시면 같은 절차로 안내드립니다.</p>')
      + '<pre class="mt-3" style="white-space:pre-wrap;background:var(--concrete-3);border:1px solid var(--concrete-2);border-radius:4px;padding:14px;font:13.5px/1.6 var(--font-body);color:var(--ink-2)" id="iq-summary">'+esc(text)+'</pre>'
      + '<div class="row mt-2">'
      + '<button class="btn btn-light btn-sm" type="button" id="iq-copy">내용 복사</button>'
      + '<a class="btn btn-light btn-sm" href="sms:'+phone+'?body='+smsBody+'">문자로 보내기</a>'
      + '<a class="btn btn-light btn-sm" href="mailto:'+email+'?subject='+encodeURIComponent('[메가스팟 행사 문의] '+ref)+'&body='+mailBody+'">이메일로 보내기</a>'
      + '<a class="btn btn-dark btn-sm" href="tel:'+phone+'">전화 상담</a>'
      + '</div>'
      + '<button class="btn btn-ghost btn-sm mt-3" type="button" id="iq-again">새 문의 작성</button>'
      + '</div>';
    return html;
  }

  M.renderInquiry = function(container, o){
    o=o||{}; container.innerHTML=template(o);
    var form=container.querySelector('#inquiry-form'), done=container.querySelector('#iq-done');
    var spaceSel=form.querySelector('#iq-space'), regionRow=form.querySelector('#iq-region-row');
    function syncSpace(){ var isReq=spaceSel.value==='request'; regionRow.hidden=!isReq; }
    spaceSel.addEventListener('change', syncSpace); syncSpace();
    // 시간대 세그먼트
    var seg=form.querySelector('#iq-slot'), slotIn=form.querySelector('input[name=slot]'), times=form.querySelector('#iq-times');
    seg.addEventListener('click', function(e){ var b=e.target.closest('button'); if(!b) return; seg.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);}); slotIn.value=b.dataset.v; times.hidden=b.dataset.v!=='custom'; });
    // 날짜 최소값
    var dateIn=form.querySelector('#iq-date'); dateIn.min=M.fmtDate(new Date()); form.querySelector('#iq-date2').min=dateIn.min;
    // 전화번호 자동 하이픈
    form.querySelector('#iq-phone').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });

    form.addEventListener('submit', function(e){
      e.preventDefault();
      var err=form.querySelector('#iq-error'); err.hidden=true;
      if(!M.validate(form)){ err.textContent='필수 항목을 확인해 주세요.'; err.hidden=false; return; }
      var d=M.formData(form); d.needs=[].concat(d.needs||[]); d.docs=[].concat(d.docs||[]);
      d.source=location.pathname; d.summary=summary(d);
      var btn=form.querySelector('#iq-submit'); btn.disabled=true; btn.textContent='보내는 중…';
      M.api('/inquiry',{method:'POST', body:d}).then(function(r){
        form.hidden=true; done.hidden=false; done.innerHTML=donePanel(r.ref, d, true); bind(); done.scrollIntoView({behavior:'smooth',block:'start'});
      }).catch(function(ex){
        if(ex.code==='NO_API'){ var ref=M.localRef('MS'); form.hidden=true; done.hidden=false; done.innerHTML=donePanel(ref, d, false); bind(); done.scrollIntoView({behavior:'smooth',block:'start'}); }
        else { err.textContent=ex.message||'전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'; err.hidden=false; }
      }).finally(function(){ btn.disabled=false; btn.innerHTML='행사 조건으로 견적 문의 <span class="arrow">→</span>'; });
    });
    function bind(){
      var c=done.querySelector('#iq-copy'); if(c) c.addEventListener('click', function(){ var t=done.querySelector('#iq-summary').textContent; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast('문의 내용을 복사했습니다.'); }).catch(function(){ var r=document.createRange(); r.selectNodeContents(done.querySelector('#iq-summary')); var s=getSelection(); s.removeAllRanges(); s.addRange(r); M.toast('내용을 선택했습니다. 복사해 주세요.'); }); });
      var a=done.querySelector('#iq-again'); if(a) a.addEventListener('click', function(){ form.reset(); form.hidden=false; done.hidden=true; syncSpace(); form.scrollIntoView({behavior:'smooth'}); });
    }
    return {
      setDate:function(iso){ dateIn.value=iso; dateIn.classList.remove('invalid'); },
      setSlot:function(v){ var b=seg.querySelector('button[data-v="'+v+'"]'); if(b) b.click(); },
      form:form
    };
  };
})();
