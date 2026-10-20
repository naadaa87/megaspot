/* =====================================================================
   간단 문의서 컴포넌트
   - MEGASPOT.renderInquiry(container, { spaceId, mode:'space'|'request', type:'event'|'regular'|'partner', prefill:{...} })
   - 날짜가 정해진 행사는 '예약 신청 · 금액 확인'(pricing-ui.js)에서 바로 신청합니다.
     이 문의서는 정기·반복 모임, 제휴·협력, 조건에 맞는 공간 찾기처럼 요금표와 별도로 상의할 일에 씁니다.
   - 필수는 이름·연락처·동의(제휴는 회사명·제안 내용 포함)뿐이고, 나머지는 모두 선택입니다.
   - API 연결 시 /api/inquiry 로 저장, 미연결 시 체험 모드(내용 복사·카카오톡)로 전환
   ===================================================================== */
(function(){
  var M=window.MEGASPOT, esc=M.esc, CC=window.MEGASPOT_CATERING_CALC||null;   // CC: 출장뷔페 계산 (catering-calc.js)
  var PUR=window.MEGASPOT_PURPOSES||[], REG=window.MEGASPOT_REGIONS||[];
  var TYPES=[['event','행사 한 번','날짜가 정해진 모임·행사'],['regular','정기·반복 모임','매주·격주·매월 여는 모임'],['partner','제휴·협력','함께 행사를 만드는 기업·기관·업체']];
  var SLOTS=[['pkg-day','낮 10–17시'],['pkg-allday','올데이 10–24시'],['pkg-allnight','올나잇 18–07시'],['morning','아침'],['day','낮'],['evening','저녁'],['undecided','미정']];
  var CYCLE=[['','선택'],['매주','매주'],['격주','격주'],['월 2회','월 2회'],['월 1회','월 1회'],['학기 중 수시','학기 중 수시'],['기타','기타']];
  var PKIND=[['','선택'],['행사 기획·대행사','행사 기획·대행사'],['케이터링·장비·인력 협력','케이터링·장비·인력 협력'],['브랜드·기업 제휴','브랜드·기업 제휴'],['학교·기관·커뮤니티 협력','학교·기관·커뮤니티 협력'],['공간 운영 협력','공간 운영 협력'],['기타','기타']];
  var FS='style="border:0;padding:0;margin:0;display:grid;gap:14px"';
  var TYPE_LABEL={event:'행사 대관', regular:'정기·반복 모임', partner:'제휴·협력·파트너'};
  var SUBMIT={event:'문의 보내기', regular:'정기 모임 상담 요청', partner:'제휴·협력 제안 보내기'};

  function opt(list, sel){ return list.map(function(p){ var v=Array.isArray(p)?p[0]:p.id, l=Array.isArray(p)?p[1]:p.label; return '<option value="'+esc(v)+'"'+(String(sel)===String(v)?' selected':'')+'>'+esc(l)+'</option>'; }).join(''); }
  function label(list, v){ for(var i=0;i<list.length;i++){ var k=Array.isArray(list[i])?list[i][0]:list[i].id; if(String(k)===String(v)) return Array.isArray(list[i])?list[i][1]:list[i].label; } return v||''; }

  function template(o){
    var isReq = o.mode==='request', pf=o.prefill||{};
    return ''
    + '<form class="form card" id="inquiry-form" novalidate>'
    + '<div><div class="eyebrow">Inquiry</div><h3 class="h-m mt-1" id="iq-title">간단 문의</h3><p class="small muted mt-1" id="iq-sub">이름과 연락처만 있으면 보낼 수 있습니다. 나머지는 아는 만큼만 적어 주세요.</p></div>'
    + (o.hideTypes ? '<input type="hidden" name="inquiry_type" value="event">'
      : '<div class="f"><span class="lbl">어떤 문의인가요?</span><div class="iq-types" id="iq-types" role="radiogroup" aria-label="문의 유형">'
        + TYPES.map(function(t){ return '<button type="button" class="iq-type" role="radio" aria-checked="false" data-v="'+t[0]+'"><b>'+esc(t[1])+'</b><span>'+esc(t[2])+'</span></button>'; }).join('')
        + '</div><input type="hidden" name="inquiry_type" value="event"><span class="hint" id="iq-type-hint"></span></div>')
    + '<input type="hidden" name="space_id" value="'+esc(isReq?'request':(o.spaceId||'megaspot-gundae'))+'">'

    // 연락처 (맨 위 · 필수)
    + '<fieldset '+FS+'>'
    + '<div class="member-line" id="iq-member" hidden></div>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-name">이름 <span class="req">*</span></label><input class="input" id="iq-name" name="name" autocomplete="name" maxlength="40" placeholder="예: 김민지" required></div>'
    + '<div class="f"><label for="iq-phone">휴대폰 번호 <span class="req">*</span></label><input class="input" type="tel" id="iq-phone" name="phone" autocomplete="tel" placeholder="010-0000-0000" required></div>'
    + '</div>'
    + '<div class="field-row" id="iq-org-row" hidden>'
    + '<div class="f"><label for="iq-org">회사·단체명 <span class="req">*</span></label><input class="input" id="iq-org" name="org" maxlength="120" placeholder="예: ○○컴퍼니, ○○대학교 학생회"></div>'
    + '<div class="f"><label for="iq-pkind">제휴 형태 <span class="muted">(선택)</span></label><select class="select" id="iq-pkind" name="partner_kind">'+opt(PKIND,'')+'</select></div>'
    + '</div>'
    + '</fieldset>'

    // 모임 조건 (모두 선택)
    + '<fieldset id="fs-cond" '+FS+'><legend class="kicker">모임 조건 <span class="muted" style="font-weight:600;text-transform:none;letter-spacing:0">— 모두 선택 사항</span></legend>'
    + '<div class="field-row three">'
    + '<div class="f"><label for="iq-date" id="iq-date-lbl">희망일</label><input class="input" type="date" id="iq-date" name="date" value="'+esc(pf.date||'')+'"></div>'
    + '<div class="f"><label for="iq-people">인원</label><input class="input" type="number" inputmode="numeric" min="1" max="200" id="iq-people" name="headcount" value="'+esc(pf.people||'')+'" placeholder="예: 80"></div>'
    + '<div class="f"><label for="iq-purpose">모임 유형</label><select class="select" id="iq-purpose" name="purpose"><option value="">선택 안 함</option>'+opt(PUR, pf.purpose)+'<option value="other"'+(pf.purpose==='other'?' selected':'')+'>기타</option></select></div>'
    + '</div>'
    + '<div class="f"><span class="lbl">시간대</span><div class="pick" id="iq-slot">'+SLOTS.map(function(s){ return '<button type="button" data-v="'+s[0]+'"'+(s[0]===(pf.slot||'undecided')?' class="on"':'')+'>'+esc(s[1])+'</button>'; }).join('')+'</div><input type="hidden" name="slot" value="'+esc(pf.slot||'undecided')+'"></div>'
    + '<div class="field-row" id="iq-regular-row" hidden>'
    + '<div class="f"><label for="iq-cycle">반복 주기</label><select class="select" id="iq-cycle" name="repeat_cycle">'+opt(CYCLE,'')+'</select></div>'
    + '<div class="f"><label for="iq-days">요일·기간</label><input class="input" id="iq-days" name="repeat_days" maxlength="100" placeholder="예: 둘째·넷째 화요일 저녁, 3개월"></div>'
    + '</div>'
    + '<div class="field-row" id="iq-region-row"'+(isReq?'':' hidden')+'>'
    + '<div class="f"><label for="iq-region">희망 지역</label><select class="select" id="iq-region" name="region"><option value="">무관</option>'+opt(REG, pf.region)+'</select></div>'
    + '<div class="f"><label for="iq-theme">원하는 분위기·조건</label><input class="input" id="iq-theme" name="theme" maxlength="200" placeholder="예: 밝은 홀, 무대 설치, 야외 공간"></div>'
    + '</div>'
    + '<div class="f"><label for="iq-msg" id="iq-msg-lbl">요청사항</label><textarea class="textarea" id="iq-msg" name="message" maxlength="2000" placeholder="행사 성격, 꼭 필요한 조건, 궁금한 점을 자유롭게 적어 주세요."></textarea></div>'
    + (CC ? CC.formBlock('cat') : '')
    + (M.familyAsk ? M.familyAsk('family') : '')
    + '</fieldset>'

    + '<label class="agree"><input type="checkbox" name="agree_privacy" required> <span>(필수) 문의 응대를 위해 이름·연락처·문의 내용을 수집·이용하는 데 동의합니다. 보유 기간은 처리 완료 후 1년이며 <a href="/privacy/" target="_blank" rel="noopener" style="text-decoration:underline">개인정보처리방침</a>을 따릅니다.</span></label>'
    + '<div id="iq-error" class="err" hidden></div>'
    + '<div class="row" style="align-items:center;gap:10px 16px"><button class="btn btn-primary btn-lg" type="submit" id="iq-submit">문의 보내기 <span class="arrow">→</span></button><span class="tiny muted" id="iq-note">영업시간에는 보통 2시간 안에 답을 드립니다.</span></div>'
    + '</form>'
    + '<div id="iq-done" hidden></div>';
  }

  function summary(d){
    var t=d.inquiry_type||'event', L=['[메가스팟 '+TYPE_LABEL[t]+' 문의]'];
    if(t==='partner'){ if(d.org) L.push('회사·단체: '+d.org); if(d.partner_kind) L.push('제휴 형태: '+d.partner_kind); }
    if(d.space_id==='request') L.push('희망 공간: 조건에 맞는 공간 요청'+(d.region?' · '+label(REG,d.region):''));
    if(d.purpose) L.push('모임 유형: '+(d.purpose==='other'?'기타':label(PUR,d.purpose)));
    if(d.date) L.push((t==='regular'?'첫 이용 희망일: ':'희망일: ')+d.date);
    if(d.slot && d.slot!=='undecided') L.push('시간대: '+label(SLOTS,d.slot));
    if(d.headcount) L.push('인원: '+d.headcount+'명');
    if(t==='regular' && (d.repeat_cycle||d.repeat_days)) L.push('반복: '+[d.repeat_cycle,d.repeat_days].filter(Boolean).join(' · '));
    if(d.theme) L.push('원하는 조건: '+d.theme);
    L.push('연락: '+(d.name||'')+' / '+(d.phone||''));
    if(d.message) L.push((t==='partner'?'제안 내용: ':'요청사항: ')+d.message);
    if(d.family && d.family.length && M.familyLabel) L.push('함께 알아보기: '+M.familyLabel(d.family));
    if(d.catering) L.push('출장뷔페: '+d.catering.summary);
    return L.join('\n');
  }

  function donePanel(ref, d, live){
    var text=summary(d), t=d.inquiry_type||'event', kakao=M.CONFIG.kakaoChannel;
    var next = t==='partner' ? '제안 내용을 확인한 담당자가 직접 연락드립니다. 협력 범위와 조건은 요금표와 별도로 협의합니다.'
      : t==='regular' ? '반복 주기와 기간을 확인해 회차별 일정과 정기 이용 조건을 안내드립니다.'
      : '영업시간에 들어온 문의는 보통 2시간 안에 첫 답을 드립니다. 날짜가 정해져 있다면 \'예약 신청 · 금액 확인\'에서 금액을 보고 바로 신청할 수도 있습니다.';
    return '<div class="card" style="border-color:var(--cobalt)">'
      + '<div class="row between"><div class="eyebrow">'+(live?'Received':'Draft')+'</div><span class="badge '+(live?'badge-ok':'badge-warn')+'">'+(live?'문의 접수':'체험 모드 · 전송 대기')+'</span></div>'
      + '<h3 class="h-m mt-1">'+(live?'문의가 접수되었습니다':'문의 내용이 준비되었습니다')+'</h3>'
      + '<div class="oc-code mt-2"><small>접수번호</small><b>'+esc(ref)+'</b></div>'
      + (live ? '<p class="small muted mt-2">'+esc(next)+'</p>'
              : '<p class="small muted mt-2">지금은 서버가 연결되지 않아 자동 저장되지 않았습니다. 아래 내용을 카카오톡으로 보내 주시면 같은 순서로 안내드립니다.</p>')
      + '<pre class="dr-pre mt-3" id="iq-summary">'+esc(text)+'</pre>'
      + '<div class="row mt-2">'
      + (kakao ? '<a class="btn btn-kakao btn-sm" href="'+esc(kakao)+'" target="_blank" rel="noopener" id="iq-kakao">카카오톡으로 보내기</a>' : '')
      + '<button class="btn btn-light btn-sm" type="button" id="iq-copy">내용 복사</button>'
      + '<a class="btn btn-light btn-sm" href="tel:'+esc(M.CONFIG.phone.replace(/-/g,''))+'">전화</a>'
      + '<button class="btn btn-ghost btn-sm" type="button" id="iq-again">새 문의</button>'
      + '</div></div>';
  }

  M.renderInquiry = function(container, o){
    o=o||{}; container.innerHTML=template(o);
    var form=container.querySelector('#inquiry-form'), done=container.querySelector('#iq-done');
    var $f=function(s){ return form.querySelector(s); };
    var typeIn=$f('input[name=inquiry_type]'), typeBox=$f('#iq-types'), cur='event';
    var HEAD={ event:['간단 문의','이름과 연락처만 있으면 보낼 수 있습니다. 나머지는 아는 만큼만 적어 주세요.'],
               regular:['정기·반복 모임 상담','몇 명이 어떤 주기로 모이는지 알려 주시면 회차별 일정과 정기 이용 조건을 안내드립니다. 4회 이상이면 별도 할인이 있습니다.'],
               partner:['제휴·협력 제안','함께하고 싶은 일과 예상 일정·규모를 적어 주세요. 요금표와 별도로 조건을 협의합니다.'] };
    function setType(t){
      if(!TYPE_LABEL[t]) t='event'; cur=t; typeIn.value=t;
      if(typeBox) typeBox.querySelectorAll('.iq-type').forEach(function(b){ var on=b.dataset.v===t; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); });
      $f('#iq-org-row').hidden = t!=='partner'; $f('#iq-org').required = t==='partner';
      $f('#iq-regular-row').hidden = t!=='regular';
      var fam=$f('.fam-ask'); if(fam){ fam.hidden = t==='partner'; if(t==='partner') fam.querySelectorAll('input').forEach(function(i){ i.checked=false; }); }
      var cat=$f('.cat-ask'); if(cat){ cat.hidden = t==='partner'; if(t==='partner'){ var co=cat.querySelector('input[type=checkbox]'); if(co && co.checked){ co.checked=false; co.dispatchEvent(new Event('change',{bubbles:true})); } } }
      $f('#iq-date-lbl').textContent = t==='regular' ? '첫 이용 희망일' : '희망일';
      var msg=$f('#iq-msg'); msg.required = t==='partner';
      $f('#iq-msg-lbl').innerHTML = t==='partner' ? '제안 내용 <span class="req">*</span>' : '요청사항';
      msg.placeholder = t==='partner' ? '함께하고 싶은 일, 예상 일정과 규모, 원하는 조건을 적어 주세요.' : t==='regular' ? '모임 성격, 회차마다 바뀌는 조건, 보관이 필요한 물품 등을 적어 주세요.' : '행사 성격, 꼭 필요한 조건, 궁금한 점을 자유롭게 적어 주세요.';
      $f('#iq-title').textContent = o.title || HEAD[t][0]; $f('#iq-sub').textContent = o.sub || HEAD[t][1];
      var hint=$f('#iq-type-hint'); if(hint) hint.textContent = t==='event' ? '날짜가 정해진 행사는 위 \'예약 신청 · 금액 확인\'에서 금액을 보고 바로 신청하는 편이 빠릅니다.' : '';
      $f('#iq-submit').innerHTML = esc(SUBMIT[t])+' <span class="arrow">→</span>';
      form.querySelectorAll('.invalid').forEach(function(el){ el.classList.remove('invalid'); });
    }
    if(typeBox) typeBox.addEventListener('click', function(e){ var b=e.target.closest('.iq-type'); if(b) setType(b.dataset.v); });
    if(CC) CC.bind(form, 'cat', function(){ return $f('#iq-people').value; });
    setType(o.type || (o.prefill&&o.prefill.type) || 'event');

    var seg=$f('#iq-slot'), slotIn=$f('input[name=slot]');
    function setSlot(v){ var b=seg.querySelector('button[data-v="'+v+'"]'); if(!b) return; seg.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);}); slotIn.value=v; }
    seg.addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) setSlot(b.dataset.v); });
    setSlot(slotIn.value);
    var dateIn=$f('#iq-date'); dateIn.min=M.fmtDate(new Date());
    $f('#iq-phone').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });

    form.addEventListener('submit', function(e){
      e.preventDefault();
      var err=$f('#iq-error'); err.hidden=true;
      if(!M.validate(form)){ err.textContent='이름·휴대폰 번호와 동의 여부를 확인해 주세요.'; err.hidden=false; return; }
      var d=M.formData(form);
      if(d.slot==='undecided') d.slot='';
      d.family=[].concat(d.family||[]); if(!d.family.length) delete d.family;
      var cat=CC?CC.read(form,'cat',d.headcount):null; Object.keys(d).forEach(function(k){ if(k.indexOf('cat_')===0) delete d[k]; }); if(cat) d.catering=cat;
      d.contact_pref='kakao'; d.source=location.pathname; d.summary=summary(d); d.came_from=M.source?M.source():null;
      var btn=$f('#iq-submit'); btn.disabled=true; btn.textContent='보내는 중…';
      M.api('/inquiry',{method:'POST', body:d}).then(function(r){
        form.hidden=true; done.hidden=false; done.innerHTML=(r.member?'<div class="member-line on mb-3"><span><b>회원 문의로 저장했습니다.</b> 진행 상태는 마이페이지에서 확인할 수 있습니다.</span><a class="btn btn-light btn-sm" href="/mypage/">마이페이지 →</a></div>':'')+donePanel(r.ref, d, true); bind(); done.scrollIntoView({behavior:'smooth',block:'start'});
      }).catch(function(ex){
        if(ex.code==='NO_API'){ var ref=M.localRef('MS'); form.hidden=true; done.hidden=false; done.innerHTML=donePanel(ref, d, false); bind(); done.scrollIntoView({behavior:'smooth',block:'start'}); }
        else { err.textContent=ex.message||'전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'; err.hidden=false; }
      }).finally(function(){ btn.disabled=false; btn.innerHTML=esc(SUBMIT[cur])+' <span class="arrow">→</span>'; });
    });
    function copyText(t, msg){ (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast(msg); }).catch(function(){ window.prompt('아래 내용을 복사해 주세요.', t); }); }
    function bind(){
      var k=done.querySelector('#iq-kakao'); if(k) k.addEventListener('click', function(){ copyText(done.querySelector('#iq-summary').textContent, '문의 내용을 복사했습니다. 카카오톡 채팅창에 붙여 넣어 보내 주세요.'); });
      var c=done.querySelector('#iq-copy'); if(c) c.addEventListener('click', function(){ copyText(done.querySelector('#iq-summary').textContent, '문의 내용을 복사했습니다.'); });
      var a=done.querySelector('#iq-again'); if(a) a.addEventListener('click', function(){ var t=cur; form.reset(); setType(t); setSlot('undecided'); form.hidden=false; done.hidden=true; form.scrollIntoView({behavior:'smooth'}); });
    }
    var api = {
      setDate:function(iso){ dateIn.value=iso; dateIn.classList.remove('invalid'); },
      setSlot:setSlot, setType:setType,
      setPurpose:function(v){ var el=$f('#iq-purpose'); if(el && v && el.querySelector('option[value="'+v+'"]')) el.value=v; },
      prefill:function(p){ p=p||{}; if(p.type) setType(p.type); if(p.date) api.setDate(p.date); if(p.slot) setSlot(p.slot); if(p.purpose) api.setPurpose(p.purpose); if(p.people){ $f('#iq-people').value=p.people; } },
      form:form
    };
    if(M.account){
      var ml=$f('#iq-member');
      M.account.me().then(function(m){
        if(m){
          var fill=function(sel,v){ var el=$f(sel); if(el && !el.value && v){ el.value=v; el.classList.remove('invalid'); } };
          fill('#iq-name', m.name); fill('#iq-phone', m.phone); if(m.org) fill('#iq-org', m.org);
          ml.className='member-line on'; ml.innerHTML='<span><b>'+esc(m.name)+'</b>님, 회원 정보로 채웠습니다. 보낸 뒤 마이페이지에서 진행 상태를 볼 수 있습니다.</span>'; ml.hidden=false;
        } else {
          M.checkApi().then(function(live){ if(!live) return; ml.className='member-line'; ml.innerHTML='<span>로그인하면 연락처가 자동으로 채워지고 진행 상태를 마이페이지에서 볼 수 있습니다.</span><a class="btn btn-light btn-sm" href="/login/?next='+encodeURIComponent(location.pathname+location.search)+'">로그인 · 회원가입</a>'; ml.hidden=false; });
        }
      });
    }
    return api;
  };
})();
