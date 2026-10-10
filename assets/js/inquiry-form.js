/* =====================================================================
   행사 문의서 (견적 문의) 컴포넌트
   - MEGASPOT.renderInquiry(container, { spaceId, mode:'space'|'request', type:'event'|'regular'|'partner', prefill:{...} })
   - 문의 유형: 행사 대관 / 정기·반복 모임 / 제휴·협력·파트너
   - API 연결 시 /api/inquiry 로 저장, 미연결 시 체험 모드(문의 내용 복사·문자·이메일 전송)로 전환
   ===================================================================== */
(function(){
  var M=window.MEGASPOT, esc=M.esc;
  var PUR=window.MEGASPOT_PURPOSES||[], SP=window.MEGASPOT_SPACES||[], REG=window.MEGASPOT_REGIONS||[];
  var TYPES=[['event','행사 대관','날짜가 정해진 한 번의 행사'],['regular','정기·반복 모임','매주·격주·매월 여는 모임'],['partner','제휴·협력·파트너','함께 행사를 만드는 기업·기관·업체']];
  var LAYOUTS=[['lecture','강연형 (스크린을 향한 좌석)'],['classroom','책상형 (테이블 + 좌석)'],['banquet','연회형 (긴 테이블 식사)'],['standing','교류형 (스탠딩·라운지)'],['undecided','미정 · 상담 후 결정']];
  var NEEDS=[['screen','200인치 스크린·프로젝터'],['mic','무선마이크·음향'],['laptop','노트북 연결(HDMI 등)'],['power','전원·멀티탭'],['food','외부 음식 반입'],['catering','케이터링 업체 이용'],['alcohol','주류 반입'],['deco','장식·설치물'],['fx','연출 장비(스모그·LED)'],['camera','촬영 장비 반입'],['parking','주차'],['lift','엘리베이터 반입']];
  var BUDGET=[['','미정 · 견적을 보고 판단'],['~100','100만원 이하'],['100-200','100~200만원'],['200-300','200~300만원'],['300-500','300~500만원'],['500+','500만원 이상']];
  var SLOTS=[['am','오전 09–13시'],['pm','오후 14–18시'],['ev','저녁 19–23시'],['ampm','주간 09–18시'],['pmev','오후~저녁 14–23시'],['day','전일 09–23시'],['custom','직접 입력']];
  var CYCLE=[['','선택'],['매주','매주'],['격주','격주'],['월 2회','월 2회'],['월 1회','월 1회'],['학기 중 수시','학기 중 수시'],['기타','기타']];
  var PERIOD=[['','선택'],['1개월','1개월'],['3개월','3개월'],['6개월','6개월'],['1년 이상','1년 이상'],['미정','미정']];
  var PKIND=[['','선택'],['행사 기획·대행사','행사 기획·대행사'],['케이터링·장비·인력 협력','케이터링·장비·인력 협력'],['브랜드·기업 제휴','브랜드·기업 제휴'],['학교·기관·커뮤니티 협력','학교·기관·커뮤니티 협력'],['공간 운영 협력','공간 운영 협력'],['기타','기타']];
  var FS='style="border:0;padding:0;margin:0;display:grid;gap:14px"';

  function opt(list, sel){ return list.map(function(p){ var v=Array.isArray(p)?p[0]:p.id, l=Array.isArray(p)?p[1]:p.label; return '<option value="'+esc(v)+'"'+(String(sel)===String(v)?' selected':'')+'>'+esc(l)+'</option>'; }).join(''); }

  function template(o){
    var isReq = o.mode==='request';
    var spaceOpts = '<option value="">선택</option>' + SP.filter(function(s){return s.status==='open';}).map(function(s){ return '<option value="'+s.id+'"'+(o.spaceId===s.id?' selected':'')+'>'+esc(s.name)+' · '+esc(s.typeLabel)+'</option>'; }).join('') + '<option value="request"'+(isReq?' selected':'')+'>조건에 맞는 공간을 찾아 주세요</option>';
    var pf=o.prefill||{};
    return ''
    + '<form class="form card" id="inquiry-form" novalidate>'
    + '<div><div class="eyebrow">Inquiry</div><h3 class="h-m mt-1" id="iq-title">행사 문의서</h3><p class="small muted mt-1">확인되지 않은 내용을 추정해 채우지 않습니다. 모르는 항목은 비워 두셔도 됩니다. <span class="req">*</span> 표시는 필수입니다.</p></div>'

    + '<div class="f"><span class="lbl">문의 유형</span><div class="iq-types" id="iq-types" role="radiogroup" aria-label="문의 유형">'
    + TYPES.map(function(t){ return '<button type="button" class="iq-type" role="radio" aria-checked="false" data-v="'+t[0]+'"><b>'+esc(t[1])+'</b><span>'+esc(t[2])+'</span></button>'; }).join('')
    + '</div><input type="hidden" name="inquiry_type" value="event"><span class="hint" id="iq-type-hint"></span></div>'

    + '<div class="iq-est" id="iq-est" hidden><div class="row between" style="gap:8px"><b class="small">예상 금액 계산 결과를 함께 보냅니다</b><button type="button" class="btn btn-light btn-sm" id="iq-est-clear">빼기</button></div><pre id="iq-est-text"></pre><input type="hidden" name="estimate" value=""></div>'

    + '<fieldset id="fs-basic" '+FS+'><legend class="kicker">기본 정보</legend>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-space">희망 공간 <span class="req">*</span></label><select class="select" id="iq-space" name="space_id" required>'+spaceOpts+'</select></div>'
    + '<div class="f"><label for="iq-purpose">행사 목적 <span class="req">*</span></label><select class="select" id="iq-purpose" name="purpose" required><option value="">선택</option>'+opt(PUR, pf.purpose)+'<option value="other"'+(pf.purpose==='other'?' selected':'')+'>기타</option></select></div>'
    + '</div>'
    + '<div class="field-row" id="iq-region-row"'+(isReq?'':' hidden')+'>'
    + '<div class="f"><label for="iq-region">희망 지역</label><select class="select" id="iq-region" name="region"><option value="">무관</option>'+opt(REG, pf.region)+'</select></div>'
    + '<div class="f"><label for="iq-theme">원하는 분위기·조건</label><input class="input" id="iq-theme" name="theme" placeholder="예: 밝은 홀, 무대 설치, 야외 공간"></div>'
    + '</div>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-date" id="iq-date-lbl">희망 날짜 <span class="req">*</span></label><input class="input" type="date" id="iq-date" name="date" value="'+esc(pf.date||'')+'" required><span class="hint" id="iq-date-hint">정해지지 않았다면 가장 가능성 높은 날을 적어 주세요.</span></div>'
    + '<div class="f"><label for="iq-date2">대체 가능일</label><input class="input" type="date" id="iq-date2" name="date_alt"></div>'
    + '</div></fieldset>'

    + '<fieldset id="fs-regular" '+FS+' hidden disabled><legend class="kicker">반복 일정</legend>'
    + '<div class="field-row three">'
    + '<div class="f"><label for="iq-cycle">반복 주기</label><select class="select" id="iq-cycle" name="repeat_cycle">'+opt(CYCLE,'')+'</select></div>'
    + '<div class="f"><label for="iq-period">예상 기간</label><select class="select" id="iq-period" name="repeat_period">'+opt(PERIOD,'')+'</select></div>'
    + '<div class="f"><label for="iq-days">선호 요일·시간대</label><input class="input" id="iq-days" name="repeat_days" placeholder="예: 둘째·넷째 화요일 저녁"></div>'
    + '</div>'
    + '<p class="hint">월 2회 이상, 3개월 이상이면 정기 대관 할인(일반 블록 20%, 피크 블록 10%, 선납하면 5%p 추가)을 적용합니다. 이 기준에 맞지 않는 반복 일정도 횟수와 기간을 보고 따로 협의합니다.</p>'
    + '</fieldset>'

    + '<fieldset id="fs-partner" '+FS+' hidden disabled><legend class="kicker">제휴·협력 내용</legend>'
    + '<div class="field-row">'
    + '<div class="f"><label for="iq-org">회사·단체명 <span class="req">*</span></label><input class="input" id="iq-org" name="org" data-req="partner" placeholder="예: ○○컴퍼니, ○○대학교 학생회"></div>'
    + '<div class="f"><label for="iq-pkind">제휴 형태</label><select class="select" id="iq-pkind" name="partner_kind">'+opt(PKIND,'')+'</select></div>'
    + '</div>'
    + '<p class="hint">요금표와 별도로 조건을 정합니다. 아래 제안 내용 칸에 함께하고 싶은 일, 예상 일정과 규모, 원하는 조건을 적어 주세요.</p>'
    + '</fieldset>'

    + '<fieldset id="fs-time" '+FS+'><legend class="kicker">시간</legend>'
    + '<div class="f"><span class="lbl">시간대 <span class="req">*</span></span><div class="pick" id="iq-slot">'+SLOTS.map(function(s){ return '<button type="button" data-v="'+s[0]+'"'+(s[0]===(pf.slot||'pm')?' class="on"':'')+'>'+esc(s[1])+'</button>'; }).join('')+'</div><input type="hidden" name="slot" value="'+esc(pf.slot||'pm')+'"></div>'
    + '<div class="field-row" id="iq-times" hidden>'
    + '<div class="f"><label for="iq-t1">준비 시작</label><input class="input" type="time" id="iq-t1" name="t_setup"></div>'
    + '<div class="f"><label for="iq-t2">행사 시작</label><input class="input" type="time" id="iq-t2" name="t_start"></div>'
    + '<div class="f"><label for="iq-t3">행사 종료</label><input class="input" type="time" id="iq-t3" name="t_end"></div>'
    + '<div class="f"><label for="iq-t4">철수 완료</label><input class="input" type="time" id="iq-t4" name="t_out"></div>'
    + '</div>'
    + '<p class="hint">블록 4시간 안에 준비·철수가 들어 있습니다. 블록을 이어 쓰면 2블록 15%, 전일 20%를 할인합니다.</p>'
    + '</fieldset>'

    + '<fieldset id="fs-people" '+FS+'><legend class="kicker">인원과 배치</legend>'
    + '<div class="field-row three">'
    + '<div class="f"><label for="iq-people">참석자 수 <span class="req">*</span></label><input class="input" type="number" min="1" max="999" id="iq-people" name="headcount" value="'+esc(pf.people||'')+'" placeholder="예: 80" required></div>'
    + '<div class="f"><label for="iq-staff">진행자·스태프</label><input class="input" type="number" min="0" max="99" id="iq-staff" name="staff" placeholder="예: 4"></div>'
    + '<div class="f"><label for="iq-layout">배치 형태</label><select class="select" id="iq-layout" name="layout">'+opt(LAYOUTS, pf.layout||'undecided')+'</select></div>'
    + '</div></fieldset>'

    + '<fieldset id="fs-needs" '+FS+'><legend class="kicker">필수 조건</legend>'
    + '<div class="checks">'+NEEDS.map(function(n){ return '<label class="chk"><input type="checkbox" name="needs" value="'+n[0]+'"> '+esc(n[1])+'</label>'; }).join('')+'</div>'
    + '<div class="f"><label for="iq-food">음식·연출 계획</label><input class="input" id="iq-food" name="food_fx" placeholder="예: 도시락 80개 반입, 음료 셀프바, 포토월 설치 예정"></div>'
    + '</fieldset>'

    + '<fieldset id="fs-contact" '+FS+'><legend class="kicker">예산과 연락처</legend>'
    + '<div class="field-row">'
    + '<div class="f" id="iq-budget-f"><label for="iq-budget">총예산 (선택)</label><select class="select" id="iq-budget" name="budget">'+opt(BUDGET,'')+'</select><span class="hint">공간료와 패키지·옵션, 보증금은 견적서에서 항목별로 나눠 적습니다.</span></div>'
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
    + '<div class="f"><label for="iq-msg" id="iq-msg-lbl">요청사항</label><textarea class="textarea" id="iq-msg" name="message" maxlength="2000" placeholder="행사 흐름, 꼭 필요한 조건, 걱정되는 점을 자유롭게 적어 주세요."></textarea></div>'
    + '</fieldset>'

    + '<label class="agree"><input type="checkbox" name="agree_privacy" required> <span>(필수) 문의 응대와 견적 안내를 위해 이름·연락처·이메일·문의 내용을 수집·이용하는 데 동의합니다. 보유 기간은 문의 처리 완료 후 1년이며, <a href="/privacy/" style="text-decoration:underline">개인정보처리방침</a>을 따릅니다.</span></label>'
    + '<label class="agree"><input type="checkbox" name="agree_marketing"> <span>(선택) 공간 소식과 빈 시간대 안내를 받겠습니다.</span></label>'
    + '<div class="form-note" id="iq-note">문의 완료는 예약 확정이 아닙니다. 조건을 확인한 뒤 견적과 일정 확보 여부를 안내드리며, 결제가 완료되어야 예약이 확정됩니다.</div>'
    + '<div id="iq-error" class="err" hidden></div>'
    + '<button class="btn btn-primary btn-lg" type="submit" id="iq-submit">행사 조건으로 견적 문의 <span class="arrow">→</span></button>'
    + '</form>'
    + '<div id="iq-done" hidden></div>';
  }

  function label(list, v){ for(var i=0;i<list.length;i++){ var k=Array.isArray(list[i])?list[i][0]:list[i].id; if(String(k)===String(v)) return Array.isArray(list[i])?list[i][1]:list[i].label; } return v||''; }
  var TYPE_LABEL={event:'행사 대관', regular:'정기·반복 모임', partner:'제휴·협력·파트너'};
  var SUBMIT={event:'행사 조건으로 견적 문의', regular:'반복 모임 상담 요청', partner:'제휴·협력 제안 보내기'};

  function summary(d){
    var t=d.inquiry_type||'event';
    var sp = SP.find(function(s){return s.id===d.space_id;});
    var lines=[];
    lines.push('[메가스팟 '+TYPE_LABEL[t]+' 문의]');
    if(t==='partner'){
      if(d.org) lines.push('회사·단체: '+d.org);
      if(d.partner_kind) lines.push('제휴 형태: '+d.partner_kind);
    } else {
      lines.push('희망 공간: '+(sp?sp.name:(d.space_id==='request'?'조건에 맞는 공간 요청':(d.space_id||'-'))));
      if(d.region) lines.push('희망 지역: '+label(REG,d.region));
      lines.push('행사 목적: '+(d.purpose==='other'?'기타':label(PUR,d.purpose)));
      if(t==='regular'){
        lines.push('반복: '+([d.repeat_cycle, d.repeat_period, d.repeat_days].filter(Boolean).join(' · ')||'-'));
        if(d.date) lines.push('첫 이용 희망일: '+d.date+(d.date_alt?' (대체 '+d.date_alt+')':''));
      } else lines.push('희망 날짜: '+(d.date||'-')+(d.date_alt?' (대체 '+d.date_alt+')':''));
      var slot=label(SLOTS,d.slot); if(d.slot==='custom'){ slot='준비 '+(d.t_setup||'-')+' / 행사 '+(d.t_start||'-')+'–'+(d.t_end||'-')+' / 철수 '+(d.t_out||'-'); }
      lines.push('시간: '+slot);
      lines.push('인원: 참석 '+(d.headcount||'-')+'명'+(d.staff?' + 스태프 '+d.staff+'명':''));
      lines.push('배치: '+label(LAYOUTS,d.layout));
      var needs=[].concat(d.needs||[]).map(function(v){return label(NEEDS,v);}); if(needs.length) lines.push('필수 조건: '+needs.join(', '));
      if(d.food_fx) lines.push('음식·연출: '+d.food_fx);
      if(d.theme) lines.push('원하는 조건: '+d.theme);
      if(d.budget) lines.push('총예산: '+label(BUDGET,d.budget));
    }
    var docs=[].concat(d.docs||[]).map(function(v){return {quote:'견적서',tax:'세금계산서',receipt:'증빙 서류'}[v]||v;}); if(docs.length) lines.push('서류: '+docs.join(', '));
    lines.push('연락: '+(d.name||'')+' / '+(d.phone||'')+(d.email?' / '+d.email:'')+' / 선호 '+({phone:'전화',sms:'문자',email:'이메일',kakao:'카카오톡'}[d.contact_pref]||''));
    if(d.message) lines.push((t==='partner'?'제안 내용: ':'요청사항: ')+d.message);
    if(d.estimate) lines.push('\n'+d.estimate);
    return lines.join('\n');
  }

  function donePanel(ref, d, live){
    var text=summary(d), t=d.inquiry_type||'event';
    var smsBody=encodeURIComponent(text), mailBody=encodeURIComponent(text);
    var phone=M.CONFIG.phone.replace(/-/g,''), email=M.CONFIG.email, kakao=M.CONFIG.kakaoChannel;
    var next = t==='partner' ? '제안 내용을 확인한 담당자가 직접 연락드립니다. 협력 범위와 조건은 요금표와 별도로 협의합니다.'
      : t==='regular' ? '반복 주기와 기간을 확인해 회차별 일정과 정기 대관 조건을 안내드립니다. 기준에 맞지 않는 일정도 따로 협의합니다.'
      : '영업시간 내 문의는 2시간 이내 첫 답변, 조건이 갖춰진 문의는 1영업일 안에 견적을 드리는 것을 목표로 합니다. 문의 완료는 예약 확정이 아니며, 견적을 받은 뒤 72시간 동안 무료로 날짜를 잡아 둘 수 있습니다.';
    return '<div class="card" style="border-color:var(--cobalt)">'
      + '<div class="row between"><div class="eyebrow">'+(live?'Received':'Draft ready')+'</div><span class="badge '+(live?'badge-ok':'badge-warn')+'">'+(live?'문의 접수 완료':'체험 모드 · 전송 대기')+'</span></div>'
      + '<h3 class="h-m mt-1">'+(live?'문의가 접수되었습니다':'문의 내용이 준비되었습니다')+'</h3>'
      + '<p class="mt-2" style="font-size:15px">문의번호 <b style="font-family:var(--font-display);font-size:22px;letter-spacing:.02em;color:var(--cobalt)">'+esc(ref)+'</b></p>'
      + (live ? '<p class="small muted mt-1">'+esc(next)+'</p>'
              : '<p class="small muted mt-1">지금은 서버 데이터베이스가 연결되지 않아 문의가 자동 저장되지 않습니다. 아래 내용을 '+(kakao?'카카오톡·':'')+'문자·이메일로 보내 주시면 같은 절차로 안내드립니다.</p>')
      + '<pre class="mt-3" style="white-space:pre-wrap;background:var(--concrete-3);border:1px solid var(--concrete-2);border-radius:4px;padding:14px;font:13.5px/1.6 var(--font-body);color:var(--ink-2)" id="iq-summary">'+esc(text)+'</pre>'
      + '<div class="row mt-2">'
      + (kakao ? '<a class="btn btn-kakao btn-sm" href="'+esc(kakao)+'" target="_blank" rel="noopener" id="iq-kakao">카카오톡으로 보내기</a>' : '')
      + '<button class="btn btn-light btn-sm" type="button" id="iq-copy">내용 복사</button>'
      + '<a class="btn btn-light btn-sm" href="sms:'+phone+'?body='+smsBody+'">문자로 보내기</a>'
      + '<a class="btn btn-light btn-sm" href="mailto:'+email+'?subject='+encodeURIComponent('[메가스팟 '+TYPE_LABEL[t]+' 문의] '+ref)+'&body='+mailBody+'">이메일로 보내기</a>'
      + '<a class="btn btn-dark btn-sm" href="tel:'+phone+'">전화 상담</a>'
      + '</div>'
      + (kakao ? '<p class="tiny muted mt-2">\'카카오톡으로 보내기\'를 누르면 위 내용이 복사되고 카카오톡 채널이 열립니다. 채팅창에 붙여 넣어 보내 주세요. '+esc(M.CONFIG.kakaoNote||'')+'</p>' : '')
      + '<button class="btn btn-ghost btn-sm mt-3" type="button" id="iq-again">새 문의 작성</button>'
      + '</div>';
  }

  M.renderInquiry = function(container, o){
    o=o||{}; container.innerHTML=template(o);
    var form=container.querySelector('#inquiry-form'), done=container.querySelector('#iq-done');
    var $f=function(s){ return form.querySelector(s); };
    var spaceSel=$f('#iq-space'), regionRow=$f('#iq-region-row');
    function syncSpace(){ var isReq=spaceSel.value==='request'; regionRow.hidden=!isReq; }
    spaceSel.addEventListener('change', syncSpace); syncSpace();

    // 문의 유형
    var typeIn=$f('input[name=inquiry_type]'), typeBox=$f('#iq-types'), cur='event';
    var SHOW={ 'fs-basic':['event','regular'], 'fs-regular':['regular'], 'fs-partner':['partner'], 'fs-time':['event','regular'], 'fs-people':['event','regular'], 'fs-needs':['event','regular'] };
    function setType(t){
      if(!TYPE_LABEL[t]) t='event'; cur=t; typeIn.value=t;
      typeBox.querySelectorAll('.iq-type').forEach(function(b){ var on=b.dataset.v===t; b.classList.toggle('on',on); b.setAttribute('aria-checked',String(on)); });
      Object.keys(SHOW).forEach(function(id){ var fs=$f('#'+id), on=SHOW[id].indexOf(t)>=0; fs.hidden=!on; fs.disabled=!on; });
      var dateIn=$f('#iq-date'); dateIn.required = t==='event';
      $f('#iq-date-lbl').innerHTML = t==='regular' ? '첫 이용 희망일' : '희망 날짜 <span class="req">*</span>';
      $f('#iq-date-hint').textContent = t==='regular' ? '정해진 날이 없으면 비워 두셔도 됩니다.' : '정해지지 않았다면 가장 가능성 높은 날을 적어 주세요.';
      $f('#iq-org').required = t==='partner';
      var msg=$f('#iq-msg'); msg.required = t==='partner';
      $f('#iq-msg-lbl').innerHTML = t==='partner' ? '제안 내용 <span class="req">*</span>' : '요청사항';
      msg.placeholder = t==='partner' ? '함께하고 싶은 일, 예상 일정과 규모, 원하는 조건을 적어 주세요.' : t==='regular' ? '모임 성격, 회차마다 바뀌는 조건, 보관이 필요한 물품 등을 적어 주세요.' : '행사 흐름, 꼭 필요한 조건, 걱정되는 점을 자유롭게 적어 주세요.';
      $f('#iq-budget-f').hidden = t==='partner';
      $f('#iq-title').textContent = t==='partner' ? '제휴·협력 제안서' : t==='regular' ? '반복 모임 상담 신청' : '행사 문의서';
      $f('#iq-type-hint').textContent = t==='partner' ? '제휴·협력·파트너 조건은 요금표와 별도로 협의합니다.' : t==='regular' ? '반복 모임은 정기 대관 할인을 기본으로, 맞지 않는 일정도 따로 협의합니다.' : '';
      $f('#iq-note').textContent = t==='event' ? '문의 완료는 예약 확정이 아닙니다. 조건을 확인한 뒤 견적과 일정 확보 여부를 안내드리며, 결제가 완료되어야 예약이 확정됩니다.' : '보내 주신 내용을 확인한 담당자가 연락드립니다. 협의 내용은 견적서나 계약서에 적어 확정합니다.';
      $f('#iq-submit').innerHTML = esc(SUBMIT[t])+' <span class="arrow">→</span>';
      form.querySelectorAll('.invalid').forEach(function(el){ el.classList.remove('invalid'); });
    }
    typeBox.addEventListener('click', function(e){ var b=e.target.closest('.iq-type'); if(b) setType(b.dataset.v); });
    setType(o.type || (o.prefill&&o.prefill.type) || 'event');

    // 예상 금액 계산 결과
    var estBox=$f('#iq-est'), estIn=$f('input[name=estimate]');
    function setEstimate(text){ estIn.value=text||''; $f('#iq-est-text').textContent=text||''; estBox.hidden=!text; }
    $f('#iq-est-clear').addEventListener('click', function(){ setEstimate(''); });
    if(o.prefill && o.prefill.estimate) setEstimate(o.prefill.estimate);

    // 시간대
    var seg=$f('#iq-slot'), slotIn=$f('input[name=slot]'), times=$f('#iq-times');
    function setSlot(v){ var b=seg.querySelector('button[data-v="'+v+'"]'); if(!b) return; seg.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);}); slotIn.value=v; times.hidden=v!=='custom'; }
    seg.addEventListener('click', function(e){ var b=e.target.closest('button'); if(b) setSlot(b.dataset.v); });
    setSlot(slotIn.value);
    // 날짜 최소값
    var dateIn=$f('#iq-date'); dateIn.min=M.fmtDate(new Date()); $f('#iq-date2').min=dateIn.min;
    // 전화번호 자동 하이픈
    $f('#iq-phone').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });

    form.addEventListener('submit', function(e){
      e.preventDefault();
      var err=$f('#iq-error'); err.hidden=true;
      if(!M.validate(form)){ err.textContent='필수 항목을 확인해 주세요.'; err.hidden=false; return; }
      var d=M.formData(form); d.needs=[].concat(d.needs||[]); d.docs=[].concat(d.docs||[]);
      if(cur==='partner' && !d.space_id) d.space_id='megaspot-gundae';
      d.source=location.pathname; d.summary=summary(d);
      var btn=$f('#iq-submit'); btn.disabled=true; btn.textContent='보내는 중…';
      M.api('/inquiry',{method:'POST', body:d}).then(function(r){
        form.hidden=true; done.hidden=false; done.innerHTML=donePanel(r.ref, d, true); bind(); done.scrollIntoView({behavior:'smooth',block:'start'});
      }).catch(function(ex){
        if(ex.code==='NO_API'){ var ref=M.localRef('MS'); form.hidden=true; done.hidden=false; done.innerHTML=donePanel(ref, d, false); bind(); done.scrollIntoView({behavior:'smooth',block:'start'}); }
        else { err.textContent=ex.message||'전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'; err.hidden=false; }
      }).finally(function(){ btn.disabled=false; btn.innerHTML=esc(SUBMIT[cur])+' <span class="arrow">→</span>'; });
    });
    function bind(){
      var k=done.querySelector('#iq-kakao'); if(k) k.addEventListener('click', function(){ var t=done.querySelector('#iq-summary').textContent; if(navigator.clipboard){ navigator.clipboard.writeText(t).then(function(){ M.toast('문의 내용을 복사했습니다. 카카오톡 채팅창에 붙여 넣어 보내 주세요.'); }).catch(function(){ M.toast('카카오톡 채널을 엽니다. 위 내용을 복사해 보내 주세요.'); }); } else { M.toast('카카오톡 채널을 엽니다. 위 내용을 복사해 보내 주세요.'); } });
      var c=done.querySelector('#iq-copy'); if(c) c.addEventListener('click', function(){ var t=done.querySelector('#iq-summary').textContent; (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){ M.toast('문의 내용을 복사했습니다.'); }).catch(function(){ var r=document.createRange(); r.selectNodeContents(done.querySelector('#iq-summary')); var s=getSelection(); s.removeAllRanges(); s.addRange(r); M.toast('내용을 선택했습니다. 복사해 주세요.'); }); });
      var a=done.querySelector('#iq-again'); if(a) a.addEventListener('click', function(){ var t=cur; form.reset(); setType(t); setEstimate(''); setSlot('pm'); form.hidden=false; done.hidden=true; syncSpace(); form.scrollIntoView({behavior:'smooth'}); });
    }
    var api = {
      setDate:function(iso){ dateIn.value=iso; dateIn.classList.remove('invalid'); },
      setSlot:setSlot,
      setType:setType,
      setEstimate:setEstimate,
      setPurpose:function(v){ var el=$f('#iq-purpose'); if(el && v && el.querySelector('option[value="'+v+'"]')){ el.value=v; el.classList.remove('invalid'); } },
      setLayout:function(v){ var el=$f('#iq-layout'); if(el && v && el.querySelector('option[value="'+v+'"]')) el.value=v; },
      // 예상 금액 계산기 등에서 여러 값을 한 번에 채웁니다
      prefill:function(p){
        p=p||{};
        if(p.type) setType(p.type);
        if(p.date) api.setDate(p.date);
        if(p.slot) setSlot(p.slot);
        if(p.purpose) api.setPurpose(p.purpose);
        if(p.layout) api.setLayout(p.layout);
        if(p.people){ var pe=$f('#iq-people'); pe.value=p.people; pe.classList.remove('invalid'); }
        if(p.estimate!==undefined) setEstimate(p.estimate);
      },
      form:form
    };
    return api;
  };
})();
