/* 모임 등록 — 입력 · 미리보기 · 등록 신청 · 관리 링크 안내 */
(function(){
  'use strict';
  var M=window.MEGASPOT, $=M.$, $$=M.$$, esc=M.esc;
  var form=$('#mn-form'); if(!form) return;
  var CATS=[['seminar','강연·세미나'],['networking','네트워킹·교류'],['community','동호회·정기 모임'],['class','클래스·스터디'],['culture','공연·상영회'],['party','파티·송년회'],['popup','마켓·전시'],['etc','기타']];
  var COVERS=[['s01','세미나'],['s09','강연'],['s20','패널 토크'],['s05','워크숍'],['s04','네트워킹'],['s14','리셉션'],['s06','연말 모임'],['s13','보드게임'],['s23','정기 모임'],['s12','독서 모임'],['s11','원데이 클래스'],['s10','멘토링'],['s07','공연'],['s08','상영회'],['s22','파티'],['s16','마켓'],['p14','건대 1호 홀'],['r01','건대 2호 홀'],['r07','2호 디너'],['r09','2호 파티 조명']];
  var CAT_COVER={ seminar:'s01', networking:'s04', community:'s13', class:'s11', culture:'s07', party:'s06', popup:'s16', etc:'p14' };
  var VENUE={ 'megaspot-gundae':'메가스팟 건대 1호', 'megaspot-gundae-2':'메가스팟 건대 2호', tbd:'메가스팟 공간 협의 중', other:'다른 장소' };
  var coverTouched=false, cover='s04';

  $('#mn-cats').innerHTML=CATS.map(function(c,i){ return '<label class="chk"><input type="radio" name="category" value="'+c[0]+'"'+(c[0]==='networking'?' checked':'')+'> '+esc(c[1])+'</label>'; }).join('');
  $('#mn-covers').innerHTML=COVERS.map(function(c){ return '<label class="cp"><input type="radio" name="cover" value="'+c[0]+'"'+(c[0]===cover?' checked':'')+'><img src="'+M.imgSrc(c[0],'t')+'" alt="" loading="lazy"><span>'+esc(c[1])+'</span></label>'; }).join('');

  // 오늘(한국 시간) 이전은 고를 수 없게
  var today=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
  $('#mn-date').min=today; $('#mn-deadline').min=today;
  var q=new URLSearchParams(location.search);
  if(q.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(q.get('date')) && q.get('date')>=today) $('#mn-date').value=q.get('date');
  if(VENUE[q.get('venue')]){ var vr=form.querySelector('input[name=venue][value="'+q.get('venue')+'"]'); if(vr) vr.checked=true; }

  function val(n){ var el=form.elements[n]; if(!el) return ''; if(el.length && !el.tagName){ for(var i=0;i<el.length;i++) if(el[i].checked) return el[i].value; return ''; } return el.type==='checkbox'?el.checked:String(el.value||'').trim(); }
  function sync(){
    var v=val('venue'); $('#mn-venue-other').hidden=v!=='other';
    var paid=val('fee_type')==='paid'; $('#mn-fee-wrap').hidden=!paid; $('#mn-feenote-wrap').hidden=!paid;
    var d=$('#mn-date').value; $('#mn-deadline').max=d||''; if(d && $('#mn-deadline').value>d) $('#mn-deadline').value=d;
    if(!coverTouched){ var c=CAT_COVER[val('category')]||'s04'; if(c!==cover){ cover=c; var r=form.querySelector('input[name=cover][value="'+c+'"]'); if(r) r.checked=true; } }
    $$('[data-count]').forEach(function(s){ var el=$('#'+s.dataset.count); if(el) s.textContent=el.value.length; });
    preview();
  }
  function data(){
    var o=M.formData(form);
    o.waitlist=!!form.elements.waitlist.checked;
    var url=String(o.cover_url||'').trim(); o.cover=/^https:\/\//.test(url)?url:(val('cover')||cover); delete o.cover_url;
    return o;
  }
  function preview(){
    var o=data(), cat=CATS.filter(function(c){ return c[0]===o.category; })[0];
    $('#mn-preview').innerHTML=M.meetupCard({ ref:'MO-0000-0000', status:'open', title:o.title||'모임 이름', summary:o.summary||'한 줄 소개가 여기에 보입니다.', cat_label:cat?cat[1]:'', date:o.date||today, start_time:o.start_time||'19:00',
      venue:o.venue, venue_label:VENUE[o.venue], venue_text:o.venue_text, capacity:+o.capacity||0, min_people:+o.min_people||0, seats:0, fee_type:o.fee_type, fee:+o.fee||0, cover:o.cover, host_name:o.host_name||'주최자', verified:!!(o.booking_code&&o.booking_last4) });
    var a=$('#mn-preview a'); if(a){ a.removeAttribute('href'); a.setAttribute('aria-hidden','true'); a.tabIndex=-1; }
  }
  form.addEventListener('input', sync); form.addEventListener('change', function(e){ if(e.target.name==='cover') coverTouched=true; sync(); });
  $('#mn-phone').addEventListener('input', function(){ var v=this.value.replace(/[^0-9]/g,'').slice(0,11); if(v.length>7) v=v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'); else if(v.length>3) v=v.replace(/(\d{3})(\d+)/,'$1-$2'); this.value=v; });
  sync();

  function done(r, o){
    form.closest('.mn-layout').hidden=true;
    var box=$('#mn-done'); box.hidden=false;
    box.innerHTML='<div class="mn-done card">'
      +'<div class="eyebrow">Submitted</div><h2 class="h-m mt-1">모임 등록 신청을 받았습니다</h2>'
      +'<p class="mt-2">모임번호 <b class="ref">'+esc(r.ref)+'</b> · 운영팀이 내용을 확인한 뒤 공개합니다. 보통 1영업일 안에 끝나고, 고칠 부분이 있으면 적어 주신 휴대폰으로 연락드립니다.'+(r.verified?' 메가스팟 예약이 확인되어 공개될 때 <b>메가스팟 예약 확인</b> 표시가 함께 붙습니다.':'')+'</p>'
      +(r.manage_url?'<div class="mn-link mt-3"><label for="mn-manage">주최자 관리 링크 <span class="req">꼭 저장해 두세요</span></label><div class="row" style="gap:8px;flex-wrap:nowrap"><input class="input" id="mn-manage" readonly value="'+esc(r.manage_url)+'"><button class="btn btn-dark" type="button" id="mn-copy">복사</button></div>'
        +'<p class="tiny muted mt-1">이 링크로 공개 여부, 신청자 명단(이름·연락처·인원), 확정·대기 처리, 모집 마감을 관리합니다. 링크를 아는 사람은 누구나 명단을 볼 수 있으니 다른 사람에게 보내지 마세요. 잃어버리면 모임번호를 알려 주시면 운영팀이 본인 확인 후 다시 안내합니다.</p></div>'
        :'<div class="notice warn mt-3"><div>관리 링크를 만들지 못했습니다. 모임번호를 카카오톡으로 알려 주시면 운영팀이 관리 링크를 보내 드립니다.</div></div>')
      +'<div class="row mt-3" style="gap:10px">'+(r.manage_url?'<a class="btn btn-primary" href="'+esc(r.manage_url)+'">관리 화면 열기 <span class="arrow">→</span></a>':'')+'<a class="btn btn-light" href="/meetups/">모임 목록 보기</a>'+(o.venue==='tbd'||o.venue==='other'?'<a class="btn btn-light" href="/inquiry/?date='+esc(o.date||'')+'">메가스팟 공간 금액 확인</a>':'')+'</div>'
      +'</div>';
    var c=$('#mn-copy'); if(c) c.addEventListener('click', function(){ M.copy(r.manage_url).then(function(ok){ M.toast(ok?'관리 링크를 복사했습니다. 메모장이나 나에게 보내기로 저장해 두세요.':'복사하지 못했습니다. 링크를 길게 눌러 직접 복사해 주세요.'); }); });
    window.scrollTo({ top:box.getBoundingClientRect().top+window.scrollY-120, behavior:'smooth' });
  }
  form.addEventListener('submit', function(e){
    e.preventDefault(); var msg=$('#mn-msg'); msg.hidden=true;
    if(!M.validate(form)){ msg.textContent='표시된 항목을 확인해 주세요.'; msg.hidden=false; return; }
    var o=data();
    if(o.min_people && +o.min_people>+o.capacity){ msg.textContent='최소 진행 인원이 정원보다 많습니다.'; msg.hidden=false; $('#mn-min').focus(); return; }
    if(o.booking_code && String(o.booking_last4||'').length!==4){ msg.textContent='예약번호를 적었다면 예약자 휴대폰 뒷 4자리도 적어 주세요.'; msg.hidden=false; $('#mn-bk4').focus(); return; }
    var btn=$('#mn-submit'); btn.disabled=true; btn.textContent='보내는 중…';
    M.api('/meetups/create',{ method:'POST', body:o }).then(function(r){ done(r, o); })
    .catch(function(ex){
      if(ex.code==='NO_API'){
        msg.innerHTML='<b>지금은 서버 저장이 연결되지 않아 자동 등록이 되지 않습니다.</b> 모임 이름·날짜·장소·정원을 카카오톡으로 보내 주시면 운영팀이 대신 올려 드립니다.'+(M.CONFIG.kakaoChannel?'<div class="row mt-2"><a class="btn btn-kakao btn-sm" href="'+esc(M.CONFIG.kakaoChannel)+'" target="_blank" rel="noopener">카카오톡 문의</a></div>':'');
      } else msg.textContent=ex.message||'등록하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      msg.hidden=false;
    }).finally(function(){ btn.disabled=false; btn.innerHTML='모임 등록 신청 <span class="arrow">→</span>'; });
  });
})();
