/* 메가스팟 관리자 — 플랫폼 화면: 모임 관리 · 입점·광고 신청 · 등록 공간 · 배너 광고 (admin.js 의 MEGASPOT_ADMIN 을 씁니다) */
(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN, M=window.MEGASPOT; if(!X||!M) return;
  var $=M.$, $$=M.$$, esc=M.esc, A=X.A;
  var FEAT={}, PUR={}, THE={}, REG={};
  (window.MEGASPOT_FEATURES||[]).forEach(function(f){ FEAT[f.id]=f.label; }); (window.MEGASPOT_PURPOSES||[]).forEach(function(p){ PUR[p.id]=p.label; });
  (window.MEGASPOT_THEMES||[]).forEach(function(t){ THE[t.id]=t.label; }); (window.MEGASPOT_REGIONS||[]).concat([{ id:'etc', label:'그 밖의 지역' }]).forEach(function(r){ REG[r.id]=r.label; });
  function drawer(title, html){ $('#pf-title').textContent=title; var b=$('#pf-body'); b.innerHTML=html; X.openDrawer('#adm-pf'); b.scrollTop=0; return b; }
  function closeD(){ X.closeDrawer($('#adm-pf')); }
  function oops(e){ if(!X.guard(e)) M.toast(e.message||'처리하지 못했습니다.'); }
  function d10(s){ return String(s||'').slice(0,10); }
  function opts(list, sel){ return list.map(function(o){ return '<option value="'+esc(o[0])+'"'+(String(o[0])===String(sel)?' selected':'')+'>'+esc(o[1])+'</option>'; }).join(''); }
  function checks(name, map, sel){ sel=sel||[]; return '<div class="checks">'+Object.keys(map).map(function(k){ return '<label class="chk"><input type="checkbox" name="'+name+'" value="'+esc(k)+'"'+(sel.indexOf(k)>=0?' checked':'')+'> '+esc(map[k])+'</label>'; }).join('')+'</div>'; }
  function kv(rows){ return '<dl class="pf-kv">'+rows.filter(function(r){ return r[1]!=null && r[1]!=='' && !(Array.isArray(r[1])&&!r[1].length); }).map(function(r){ return '<dt>'+esc(r[0])+'</dt><dd>'+(r[2]?r[1]:esc(Array.isArray(r[1])?r[1].join(', '):r[1]))+'</dd>'; }).join('')+'</dl>'; }
  function keyRow(e, fn){ if(e.key==='Enter'||e.key===' '){ var r=e.target.closest('[data-pref]'); if(r){ e.preventDefault(); fn(r.dataset.pref); } } }

  /* =================== 입점·공간 등록·광고 신청 =================== */
  var KIND={ host:'입점 상담', space:'공간 등록', ad:'광고·제휴' };
  var PST={ '접수':'st-new', '검토 중':'st-check', '보완 요청':'st-quote', '진행 확정':'st-ok', '보류':'st-pay', '반려·종료':'st-cancel' };
  var OPER={ self:'직접 응대', managed:'메가스팟 운영 위탁 희망', undecided:'상담 후 결정' };
  var SLOTN={ 'home-mid':'홈 중간 배너', 'list-top':'목록 위 띠 배너', 'list-card':'목록 사이 카드', 'content-bottom':'안내·상세 아래 배너', meetup:'모임 협찬', etc:'미정' };
  var hst={ kind:'', status:'', items:[], statuses:null };
  function loadHosts(){
    var box=$('#host-list');
    A('/partners?kind='+encodeURIComponent(hst.kind)+'&status='+encodeURIComponent(hst.status)).then(function(r){
      if(!hst.statuses){ hst.statuses=r.statuses||[]; $('#host-status').insertAdjacentHTML('beforeend', hst.statuses.map(function(s){ return '<option>'+esc(s)+'</option>'; }).join('')); }
      hst.items=r.items||[];
      box.innerHTML=hst.items.length?hst.items.map(function(h){ var d=h.data||{}, name=d.space_name||d.company||'(이름 없음)';
        var sub=h.kind==='ad'?[(d.slots||[]).map(function(x){ return SLOTN[x]||x; }).join(', '), d.goal, d.period].filter(Boolean).join(' · '):[d.area?d.area+'평':'', d.capacity?'최대 '+d.capacity+'명':'', d.space_type, d.role, h.kind==='space'&&d.operation?OPER[d.operation]:''].filter(Boolean).join(' · ');
        return '<div class="adm-row pf-row" data-pref="'+esc(h.ref)+'" tabindex="0"><div class="r1"><span class="tag-k '+esc(h.kind)+'">'+esc(KIND[h.kind]||h.kind)+'</span><b>'+esc(name)+'</b><span class="small muted">'+esc(h.kind==='ad'?(d.link||''):(d.address||''))+'</span><span class="st '+(PST[h.status]||'')+'">'+esc(h.status)+'</span>'+(h.listing?'<span class="tag-ch">공간 '+esc(h.listing)+'</span>':'')+'</div>'
          +'<div class="r2">'+esc(sub||'-')+'</div><div class="r3"><span>'+esc(d.name||'')+' · <a href="tel:'+esc(d.phone||'')+'">'+esc(d.phone||'')+'</a>'+(d.email?' · '+esc(d.email):'')+'</span><span>'+esc(h.ref)+' · '+esc(d10(h.created_at))+' · '+esc(X.ago(h.created_at))+'</span></div>'+(h.memo?'<div class="tiny muted">메모: '+esc(h.memo)+'</div>':'')+'</div>'; }).join('')
        :X.emptyMsg(hst.kind||hst.status?'조건에 맞는 신청이 없습니다.':'아직 들어온 신청이 없습니다.');
    }).catch(X.fail(box));
  }
  function openPartner(ref){
    var h=hst.items.filter(function(x){ return x.ref===ref; })[0]; if(!h) return;
    var d=h.data||{}, map=function(arr, m){ return (arr||[]).map(function(x){ return m[x]||x; }); };
    var photos=(d.photos||[]).length?'<div class="pf-thumbs">'+d.photos.filter(function(u){ return /^https:\/\//i.test(u); }).map(function(u){ return '<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer"><img src="'+esc(u)+'" alt="" referrerpolicy="no-referrer" loading="lazy"></a>'; }).join('')+'</div>':'';
    // 신청자가 적은 주소는 http(s) 로 시작할 때만 링크로 엽니다 (javascript: 같은 주소는 글자로만)
    var link=function(u){ u=String(u||'').trim(); if(!u) return ''; return /^https?:\/\//i.test(u)?'<a href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(u)+' ↗</a>':esc(u); };
    var rows=h.kind==='ad'?[['회사·브랜드',d.company],['홈페이지',link(d.link),1],['관심 자리',map(d.slots,SLOTN)],['목적',d.goal],['희망 기간',d.period],['예산',d.budget],['내용',d.message],['담당자',d.name],['연락처','<a href="tel:'+esc(d.phone)+'">'+esc(d.phone)+'</a>',1],['이메일',d.email]]
      :[['공간 이름',d.space_name],['주소',[d.address,d.floor].filter(Boolean).join(' ')],['지역',REG[d.region]||d.region],['가까운 역',d.station],['공간 유형',d.space_type],['총면적',d.area?d.area+'평':''],['행사 면적',d.area_event?d.area_event+'평':''],['천장 높이',d.ceiling?d.ceiling+'m':''],['최대 인원',d.capacity?d.capacity+'명':''],
        ['배치별 인원',[d.cap_theater?'강연식 '+d.cap_theater:'',d.cap_class?'교실식 '+d.cap_class:'',d.cap_banquet?'연회식 '+d.cap_banquet:'',d.cap_standing?'스탠딩 '+d.cap_standing:''].filter(Boolean).join(' · ')],['주요 시설',map(d.features,FEAT)],['받는 모임',map(d.purposes,PUR)],['분위기',map(d.themes,THE)],['주차',d.parking],
        ['이용 시간',d.hours],['비는 시간',d.available],['기본 요금',d.price_base],['추가 요금',d.price_note],['보증금',d.deposit],['취소 기준',d.cancel_policy],['이용 규칙',d.rules],['사진',photos,1],['평면도',link(d.floorplan),1],['소개',d.intro],['링크',link(d.link),1],
        ['운영 권한',d.role],['운영 방식',OPER[d.operation]||''],['예약 채널',d.channels],['사업자',[d.biz_type,d.biz_name,d.biz_no].filter(Boolean).join(' · ')],['담당자',d.name],['연락처','<a href="tel:'+esc(d.phone)+'">'+esc(d.phone)+'</a>',1],['이메일',d.email],['하고 싶은 말',d.message]];
    var b=drawer(KIND[h.kind]+' · '+h.ref, '<div class="row" style="gap:6px"><span class="tag-k">'+esc(KIND[h.kind])+'</span><span class="st '+(PST[h.status]||'')+'">'+esc(h.status)+'</span><span class="tiny muted">'+esc(String(h.created_at||'').slice(0,16))+' 접수</span></div>'
      +kv(rows)
      +'<form class="form adm-card" id="pf-pform"><div class="field-row"><div class="f"><label for="pf-pst">진행 상태</label><select class="select" id="pf-pst" name="status">'+opts((hst.statuses||[]).map(function(s){ return [s,s]; }), h.status)+'</select></div></div>'
      +'<div class="f"><label for="pf-pmemo">운영 메모</label><textarea class="textarea" id="pf-pmemo" name="memo" rows="3" maxlength="2000">'+esc(h.memo||'')+'</textarea></div>'
      +'<div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="submit">저장</button>'+(h.kind==='space'?(h.listing?'<button class="btn btn-light btn-sm" type="button" data-golisting="'+esc(h.listing)+'">등록 공간 '+esc(h.listing)+' 열기</button>':'<button class="btn btn-light btn-sm" type="button" id="pf-tolisting">이 내용으로 등록 공간 초안 만들기</button>'):'')+'</div></form>');
    $('#pf-pform').addEventListener('submit', function(e){ e.preventDefault(); A('/partners/'+ref,{ method:'PATCH', body:M.formData(e.target) }).then(function(){ M.toast('저장했습니다.'); closeD(); loadHosts(); }).catch(oops); });
    var tl=$('#pf-tolisting'); if(tl) tl.addEventListener('click', function(){ tl.disabled=true; A('/partners/'+ref+'/listing',{ method:'POST', body:{} }).then(function(r){ M.toast('등록 공간 초안 '+r.id+'을(를) 만들었습니다. 내용을 다듬고 공개로 바꿔 주세요.'); closeD(); X.go('listings'); setTimeout(function(){ openListing(r.id); }, 500); }).catch(function(e){ tl.disabled=false; oops(e); }); });
    var gl=b.querySelector('[data-golisting]'); if(gl) gl.addEventListener('click', function(){ closeD(); X.go('listings'); setTimeout(function(){ openListing(gl.dataset.golisting); }, 500); });
  }
  $('#host-reload').addEventListener('click', loadHosts);
  $('#host-filter').addEventListener('click', function(e){ var c=e.target.closest('[data-kind]'); if(!c) return; hst.kind=c.dataset.kind; $$('#host-filter .chip').forEach(function(x){ x.classList.toggle('on', x===c); }); loadHosts(); });
  $('#host-status').addEventListener('change', function(){ hst.status=this.value; loadHosts(); });
  $('#host-list').addEventListener('click', function(e){ if(e.target.closest('a')) return; var r=e.target.closest('[data-pref]'); if(r) openPartner(r.dataset.pref); });
  $('#host-list').addEventListener('keydown', function(e){ keyRow(e, openPartner); });

  /* =================== 등록 공간 =================== */
  var LST={ draft:['작성 중','st-check'], published:['공개','st-ok'], hidden:['숨김','st-cancel'] };
  var lst={ items:[] };
  function loadListings(){
    var box=$('#ls-admin-list');
    A('/listings').then(function(r){ lst.items=r.items||[];
      box.innerHTML=lst.items.length?lst.items.map(function(l){ var s=LST[l.status]||[l.status,''];
        return '<div class="adm-row pf-row" data-pref="'+esc(l.id)+'" tabindex="0"><div class="r1"><b>'+esc(l.name)+'</b><span class="small muted">'+esc([REG[l.region]||'', l.address].filter(Boolean).join(' · '))+'</span><span class="st '+s[1]+'">'+esc(s[0])+'</span></div>'
          +'<div class="r2">'+esc([l.area?l.area+'평':'', l.capacity?'최대 '+l.capacity+'명':'', l.price_note, (l.photos||[]).length?'사진 '+l.photos.length+'장':'사진 없음'].filter(Boolean).join(' · '))+'</div>'
          +'<div class="r3"><span>'+esc(l.host_name||'호스트 미입력')+(l.host_ref?' · 신청 '+esc(l.host_ref):'')+'</span><span>'+esc(l.id)+' · '+esc(d10(l.updated_at||l.created_at))+(l.status==='published'?' · <a href="/spaces/listing/?id='+esc(l.id)+'" target="_blank" rel="noopener">공개 페이지 ↗</a>':'')+'</span></div></div>'; }).join('')
        :X.emptyMsg('등록 공간이 없습니다. 공간 등록 신청에서 초안을 만들거나 [+ 새 공간]으로 직접 등록하세요.');
    }).catch(X.fail(box));
  }
  function openListing(id){
    var l=id?lst.items.filter(function(x){ return x.id===id; })[0]:null;
    if(id && !l){ A('/listings').then(function(r){ lst.items=r.items||[]; if(lst.items.some(function(x){ return x.id===id; })) openListing(id); }).catch(oops); return; }
    l=l||{ status:'draft', features:[], purposes:[], themes:[], photos:[] };
    drawer(l.id?'등록 공간 · '+l.id:'새 등록 공간', '<form class="form" id="pf-lform" novalidate>'
      +'<div class="field-row"><div class="f"><label>공간 이름 <span class="req">*</span></label><input class="input" name="name" maxlength="60" required value="'+esc(l.name||'')+'"></div><div class="f"><label>공개 상태</label><select class="select" name="status">'+opts([['draft','작성 중 (비공개)'],['published','공개'],['hidden','숨김']], l.status)+'</select></div></div>'
      +'<div class="field-row three"><div class="f"><label>지역</label><select class="select" name="region">'+opts(Object.keys(REG).map(function(k){ return [k, REG[k]]; }), l.region||'seoul-east')+'</select></div><div class="f"><label>면적 (평)</label><input class="input" name="area" inputmode="numeric" value="'+esc(l.area||'')+'"></div><div class="f"><label>최대 인원</label><input class="input" name="capacity" inputmode="numeric" value="'+esc(l.capacity||'')+'"></div></div>'
      +'<div class="field-row"><div class="f"><label>주소 (공개 · 구·동까지 권장)</label><input class="input" name="address" maxlength="120" value="'+esc(l.address||'')+'"></div><div class="f"><label>가까운 역</label><input class="input" name="station" maxlength="80" value="'+esc(l.station||'')+'"></div></div>'
      +'<div class="field-row"><div class="f"><label>공간 유형</label><input class="input" name="space_type" maxlength="30" value="'+esc(l.space_type||'')+'"></div><div class="f"><label>노출 순서 (클수록 먼저)</label><input class="input" name="sort" inputmode="numeric" value="'+esc(l.sort||0)+'"></div></div>'
      +'<div class="f"><label>한 줄 소개</label><input class="input" name="summary" maxlength="120" value="'+esc(l.summary||'')+'"></div>'
      +'<div class="f"><label>공간 소개</label><textarea class="textarea" name="description" rows="5" maxlength="4000">'+esc(l.description||'')+'</textarea></div>'
      +'<div class="f"><span class="lbl">시설</span>'+checks('features', FEAT, l.features)+'</div>'
      +'<div class="f"><span class="lbl">잘 맞는 모임</span>'+checks('purposes', PUR, l.purposes)+'</div>'
      +'<div class="f"><span class="lbl">분위기</span>'+checks('themes', THE, l.themes)+'</div>'
      +'<div class="f"><label>사진 주소 (한 줄에 하나 · https:// 또는 /assets/… · 사용 허락을 받은 사진만)</label><textarea class="textarea" name="photos" rows="4">'+esc((l.photos||[]).join('\n'))+'</textarea></div>'
      +'<div class="field-row"><div class="f"><label>요금 안내 (공개)</label><input class="input" name="price_note" maxlength="200" value="'+esc(l.price_note||'')+'" placeholder="예: 평일 시간당 15만 원부터 · 상담 후 확정"></div><div class="f"><label>이용 시간</label><input class="input" name="hours" maxlength="120" value="'+esc(l.hours||'')+'"></div></div>'
      +'<div class="f"><label>이용 규칙</label><textarea class="textarea" name="rules" rows="2" maxlength="1000">'+esc(l.rules||'')+'</textarea></div>'
      +'<div class="field-row"><div class="f"><label>호스트 표시 이름</label><input class="input" name="host_name" maxlength="60" value="'+esc(l.host_name||'')+'"></div><div class="f"><label>호스트 사업자 정보 (공개 · 통신판매중개 표시)</label><input class="input" name="host_biz" maxlength="300" value="'+esc(l.host_biz||'')+'" placeholder="상호 · 대표 · 사업자등록번호"></div></div>'
      +'<p class="tiny muted">공개로 바꾸면 공간 찾기 목록과 상세 페이지에 바로 보입니다. 면적·인원·요금은 호스트에게 확인한 값만 적어 주세요.</p>'
      +'<div class="form-note" id="pf-lmsg" hidden></div><div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="submit">저장</button>'+(l.id&&l.status==='published'?'<a class="btn btn-light btn-sm" href="/spaces/listing/?id='+esc(l.id)+'" target="_blank" rel="noopener">공개 페이지 보기 ↗</a>':'')+'</div></form>');
    $('#pf-lform').addEventListener('submit', function(e){
      e.preventDefault(); var f=e.target, msg=$('#pf-lmsg'); msg.hidden=true; if(!M.validate(f)) return;
      var d=M.formData(f); ['features','purposes','themes'].forEach(function(k){ d[k]=[].concat(d[k]||[]); }); d.photos=String(d.photos||'').split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
      (l.id?A('/listings/'+l.id,{ method:'PUT', body:d }):A('/listings',{ method:'POST', body:d })).then(function(){ M.toast('저장했습니다.'); closeD(); loadListings(); }).catch(function(x){ if(!X.guard(x)){ msg.textContent=x.message; msg.hidden=false; } });
    });
  }
  $('#ls-reload').addEventListener('click', loadListings);
  $('#ls-new').addEventListener('click', function(){ openListing(null); });
  $('#ls-admin-list').addEventListener('click', function(e){ if(e.target.closest('a')) return; var r=e.target.closest('[data-pref]'); if(r) openListing(r.dataset.pref); });
  $('#ls-admin-list').addEventListener('keydown', function(e){ keyRow(e, openListing); });

  /* =================== 모임 관리 =================== */
  var MST={ pending:['검토 중','st-new'], open:['모집 중','st-ok'], closed:['모집 마감','st-pay'], done:['종료','st-done'], cancelled:['주최자 취소','st-cancel'], rejected:['반려','st-cancel'], hidden:['숨김','st-del'] };
  var APS=[['confirmed','참가 확정'],['pending','승인 대기'],['waitlist','대기'],['cancelled','취소'],['rejected','참가 불가']];
  var CATS=[['seminar','강연·세미나'],['networking','네트워킹·교류'],['community','동호회·정기 모임'],['class','클래스·스터디'],['culture','공연·상영회'],['party','파티·송년회'],['popup','마켓·전시'],['etc','기타']];
  var VEN=[['megaspot-gundae','메가스팟 건대 1호'],['megaspot-gundae-2','메가스팟 건대 2호'],['tbd','메가스팟 공간 협의 중'],['other','다른 장소']];
  var mst={ st:'pending' };
  function mBadge(x){ var k=x.status==='done'?'done':x.raw_status; var s=MST[k]||[k,'']; return '<span class="st '+s[1]+'">'+esc(s[0])+'</span>'; }
  function loadMeetups(){
    var box=$('#mt-admin-list');
    A('/meetups?status='+encodeURIComponent(mst.st)).then(function(r){ var list=r.items||[];
      box.innerHTML=list.length?list.map(function(m){
        return '<div class="adm-row pf-row" data-pref="'+esc(m.ref)+'" tabindex="0"><div class="r1"><b>'+esc(m.title)+'</b>'+mBadge(m)+(m.featured?'<span class="tag-rv">추천</span>':'')+(m.verified?'<span class="tag-cat">예약 확인</span>':'')+'</div>'
          +'<div class="r2">'+esc(X.kd(m.date))+' '+esc(m.start_time)+' · '+esc(M.meetupWhere?M.meetupWhere(m):m.venue_label)+' · '+esc(m.cat_label)+' · 신청 <b>'+(m.seats||0)+'</b>/'+esc(m.capacity)+'명'+(m.waiting?' · 대기 '+m.waiting:'')+'</div>'
          +'<div class="r3"><span>'+esc(m.host_name)+' · <a href="tel:'+esc(m.host_phone)+'">'+esc(m.host_phone)+'</a></span><span>'+esc(m.ref)+' · 등록 '+esc(m.created_at)+'</span></div>'+(m.admin_note?'<div class="tiny muted">메모: '+esc(m.admin_note)+'</div>':'')+'</div>'; }).join('')
        :X.emptyMsg(mst.st==='pending'?'검토를 기다리는 모임이 없습니다.':'해당 상태의 모임이 없습니다.');
    }).catch(X.fail(box));
  }
  function openMeetup(ref){
    A('/meetups/'+encodeURIComponent(ref)).then(function(r){
      var m=r.item, apps=r.apps||[], raw=m.raw_status, pub=['open','closed','cancelled'].indexOf(raw)>=0;
      var act=[];
      if(['pending','hidden','rejected'].indexOf(raw)>=0) act.push('<button class="btn btn-primary btn-sm" type="button" data-mst="open">공개 승인 (모집 중)</button>');
      if(raw==='open') act.push('<button class="btn btn-light btn-sm" type="button" data-mst="closed">모집 마감</button>');
      if(raw==='closed') act.push('<button class="btn btn-light btn-sm" type="button" data-mst="open">다시 모집</button>');
      if(raw!=='rejected') act.push('<button class="btn btn-light btn-sm" type="button" data-mst="rejected">반려</button>');
      if(raw!=='hidden') act.push('<button class="btn btn-light btn-sm" type="button" data-mst="hidden">숨김</button>');
      if(raw!=='pending') act.push('<button class="btn btn-light btn-sm" type="button" data-mst="pending">검토 중으로</button>');
      var sum=function(st){ return apps.filter(function(a){ return a.status===st; }).reduce(function(s,a){ return s+(+a.people||0); },0); };
      var b=drawer('모임 · '+m.ref,
        '<div class="row" style="gap:6px">'+mBadge(m)+(m.verified?'<span class="tag-cat">메가스팟 예약 확인</span>':'')+'<span class="tiny muted">'+esc(m.created_at)+' 등록</span></div>'
        +'<h3 class="h-s mt-1">'+esc(m.title)+'</h3><p class="small muted">'+esc(m.summary)+'</p>'
        +'<div class="row mt-2" style="gap:6px;flex-wrap:wrap" id="pf-macts">'+act.join('')+'</div>'
        +'<div class="f mt-2" id="pf-mreject" hidden><label for="pf-mreason">반려 사유 (주최자 관리 화면에 보입니다)</label><input class="input" id="pf-mreason" maxlength="300" value="'+esc(m.reject_reason||'')+'" placeholder="예: 참가비 안내가 불분명합니다. 결제·환불 방법을 적어 다시 올려 주세요."><button class="btn btn-dark btn-sm mt-1" type="button" id="pf-mreject-go">반려하기</button></div>'
        +'<div class="row mt-2" style="gap:14px"><label class="agree"><input type="checkbox" id="pf-mfeat"'+(m.featured?' checked':'')+'> <span>추천 모임 (목록 위)</span></label><label class="agree"><input type="checkbox" id="pf-mver"'+(m.verified?' checked':'')+'> <span>메가스팟 예약 확인 표시</span></label></div>'
        +kv([['날짜·시간', X.kd(m.date)+' '+m.start_time+(m.end_time?'–'+m.end_time:'')],['장소', M.meetupWhere?M.meetupWhere(m):m.venue_label],['정원', m.capacity+'명'+(m.min_people?' · 최소 '+m.min_people+'명':'')+' · 1인 '+m.max_per+'명까지'],['신청 현황','확정 '+sum('confirmed')+' · 승인 대기 '+sum('pending')+' · 대기 '+sum('waitlist')+'명'],
          ['신청 방식',(m.mode==='approve'?'주최자 승인':'선착순')+(m.waitlist?' · 대기 받음':' · 대기 안 받음')+(m.deadline?' · '+m.deadline+' 마감':'')],['참가비',m.fee_type==='paid'?(M.fmtNum(m.fee)+'원'+(m.fee_note?' · '+m.fee_note:'')):'무료'],['질문',m.question],
          ['주최자',m.host_name+(m.host_intro?' — '+m.host_intro:'')],['연락처','<a href="tel:'+esc(m.host_phone)+'">'+esc(m.host_phone)+'</a>'+(m.host_email?' · '+esc(m.host_email):''),1],['예약번호',m.booking_code],['공개 문의 링크',m.contact_url?'<a href="'+esc(m.contact_url)+'" target="_blank" rel="noopener noreferrer">'+esc(m.contact_url)+'</a>':'',1],
          ['관리 링크',m.manage_url?'<button class="btn btn-light btn-xs" type="button" id="pf-mcopy">주최자 관리 링크 복사</button> <span class="tiny muted">본인 확인 후에만 전달하세요</span>':'(서버 비밀값이 없어 만들 수 없음)',1],
          ['공개 페이지',pub?'<a href="/meetups/view/?id='+esc(m.ref)+'" target="_blank" rel="noopener">열기 ↗</a>':'공개 전',1]])
        +'<details class="adm-card"><summary><b>소개 전문 보기</b></summary><div class="small mt-1" style="white-space:pre-wrap">'+esc(m.description)+'</div>'+(m.for_whom?'<p class="small mt-1"><b>추천 대상</b> '+esc(m.for_whom)+'</p>':'')+(m.notice?'<p class="small mt-1"><b>주최자 공지</b> '+esc(m.notice)+'</p>':'')+'<img src="'+esc(M.coverSrc(m.cover,'t'))+'" alt="" style="max-width:220px;border-radius:4px;margin-top:8px" referrerpolicy="no-referrer"></details>'
        +'<details class="adm-card mt-2"><summary><b>내용 고치기</b> <span class="tiny muted">오탈자·부적절한 표현 수정</span></summary><form class="form mt-2" id="pf-medit">'
          +'<div class="f"><label>모임 이름</label><input class="input" name="title" maxlength="60" value="'+esc(m.title)+'" required></div>'
          +'<div class="field-row"><div class="f"><label>분류</label><select class="select" name="category">'+opts(CATS, m.category)+'</select></div><div class="f"><label>장소</label><select class="select" name="venue">'+opts(VEN, m.venue)+'</select></div></div>'
          +'<div class="f"><label>다른 장소일 때 장소 이름·주소</label><input class="input" name="venue_text" maxlength="120" value="'+esc(m.venue_text)+'"></div>'
          +'<div class="f"><label>한 줄 소개</label><input class="input" name="summary" maxlength="90" value="'+esc(m.summary)+'" required></div>'
          +'<div class="f"><label>상세 내용</label><textarea class="textarea" name="description" rows="6" maxlength="4000">'+esc(m.description)+'</textarea></div>'
          +'<div class="field-row three"><div class="f"><label>날짜</label><input class="input" type="date" name="date" value="'+esc(m.date)+'" required></div><div class="f"><label>시작</label><input class="input" type="time" name="start_time" value="'+esc(m.start_time)+'"></div><div class="f"><label>종료</label><input class="input" type="time" name="end_time" value="'+esc(m.end_time)+'"></div></div>'
          +'<div class="field-row three"><div class="f"><label>정원</label><input class="input" type="number" name="capacity" value="'+esc(m.capacity)+'" required></div><div class="f"><label>최소 진행</label><input class="input" type="number" name="min_people" value="'+esc(m.min_people||'')+'"></div><div class="f"><label>모집 마감일</label><input class="input" type="date" name="deadline" value="'+esc(m.deadline)+'"></div></div>'
          +'<div class="field-row"><div class="f"><label>참가비 안내</label><input class="input" name="fee_note" maxlength="120" value="'+esc(m.fee_note)+'"></div><div class="f"><label>대표 이미지 (사진 id 또는 https 주소)</label><input class="input" name="cover" value="'+esc(m.cover)+'"></div></div>'
          +'<button class="btn btn-primary btn-sm" type="submit">내용 저장</button></form></details>'
        +'<div class="f mt-2"><label for="pf-mnote">운영 메모 (주최자에게 보이지 않음)</label><textarea class="textarea" id="pf-mnote" rows="2" maxlength="1000">'+esc(m.admin_note)+'</textarea><button class="btn btn-light btn-sm mt-1" type="button" id="pf-mnote-save">메모 저장</button></div>'
        +'<h3 class="h-xs mt-3">신청자 '+apps.length+'건</h3>'
        +(apps.length?'<div class="mg-list">'+apps.map(function(a){ return '<div class="mg-row st-'+esc(a.status)+'"><div class="r1"><b>'+esc(a.name)+'</b><a href="tel:'+esc(a.phone)+'">'+esc(a.phone)+'</a><span>'+esc(a.people)+'명</span><span class="tiny muted">'+esc(String(a.created_at).slice(0,16))+'</span><select class="select" data-app="'+esc(a.ref)+'">'+opts(APS, a.status)+'</select></div>'+(a.answer||a.message?'<div class="r2">'+(a.answer?'<span><b>답변</b> '+esc(a.answer)+'</span>':'')+(a.message?'<span><b>남긴 말</b> '+esc(a.message)+'</span>':'')+'</div>':'')+'</div>'; }).join('')+'</div>':X.emptyMsg('아직 신청이 없습니다.'))
        +((r.log||[]).length?'<details class="mt-3"><summary class="small"><b>변경 기록</b></summary><ul class="tiny muted mt-1">'+r.log.map(function(g){ return '<li>'+esc(String(g.created_at).slice(0,16))+' · '+esc(g.kind)+' · '+esc(g.actor)+' '+esc(g.detail)+'</li>'; }).join('')+'</ul></details>':''));
      var patch=function(body, msg){ return A('/meetups/'+encodeURIComponent(ref),{ method:'PATCH', body:body }).then(function(){ M.toast(msg||'저장했습니다.'); loadMeetups(); refreshCount(); openMeetup(ref); }).catch(oops); };
      $('#pf-macts').addEventListener('click', function(e){ var x=e.target.closest('[data-mst]'); if(!x) return; if(x.dataset.mst==='rejected'){ $('#pf-mreject').hidden=false; $('#pf-mreason').focus(); return; } patch({ status:x.dataset.mst }, x.dataset.mst==='open'?'공개했습니다. 모임 모집 화면에 보입니다.':'상태를 바꿨습니다.'); });
      $('#pf-mreject-go').addEventListener('click', function(){ patch({ status:'rejected', reject_reason:$('#pf-mreason').value }, '반려했습니다. 주최자에게 연락해 사유를 알려 주세요.'); });
      $('#pf-mfeat').addEventListener('change', function(){ patch({ featured:this.checked }); });
      $('#pf-mver').addEventListener('change', function(){ patch({ verified:this.checked }); });
      $('#pf-mnote-save').addEventListener('click', function(){ patch({ admin_note:$('#pf-mnote').value }, '메모를 저장했습니다.'); });
      $('#pf-medit').addEventListener('submit', function(e){ e.preventDefault(); if(!M.validate(e.target)) return; patch({ edit:M.formData(e.target) }, '내용을 고쳤습니다.'); });
      var cp=$('#pf-mcopy'); if(cp) cp.addEventListener('click', function(){ M.copy(m.manage_url).then(function(ok){ M.toast(ok?'관리 링크를 복사했습니다.':'복사하지 못했습니다.'); }); });
      b.querySelectorAll('select[data-app]').forEach(function(s){ s.addEventListener('change', function(){ A('/meetups/'+encodeURIComponent(ref)+'/apps/'+encodeURIComponent(s.dataset.app),{ method:'PATCH', body:{ status:s.value } }).then(function(){ M.toast('신청 상태를 바꿨습니다.'); }).catch(oops); }); });
    }).catch(oops);
  }
  function refreshCount(){ A('/platform/summary').then(function(r){ X.setCount('meetups', r.meetups_pending); X.setCount('hosts', r.partners_new); }).catch(function(){}); }
  $('#mt-reload').addEventListener('click', loadMeetups);
  $('#mt-filter').addEventListener('click', function(e){ var c=e.target.closest('[data-st]'); if(!c) return; mst.st=c.dataset.st; $$('#mt-filter .chip').forEach(function(x){ x.classList.toggle('on', x===c); }); loadMeetups(); });
  $('#mt-admin-list').addEventListener('click', function(e){ if(e.target.closest('a')) return; var r=e.target.closest('[data-pref]'); if(r) openMeetup(r.dataset.pref); });
  $('#mt-admin-list').addEventListener('keydown', function(e){ keyRow(e, openMeetup); });

  /* =================== 배너 광고 =================== */
  var ads={ items:[], slots:{}, today:'' };
  function adState(a){ if(a.status!=='on') return ['꺼짐','st-cancel']; if(a.start_date && a.start_date>ads.today) return ['게재 예정','st-check']; if(a.end_date && a.end_date<ads.today) return ['기간 끝남','st-done']; return ['게재 중','st-ok']; }
  function loadAds(){
    var box=$('#ad-admin-list');
    A('/ads').then(function(r){ ads.items=r.items||[]; ads.slots=r.slots||{}; ads.today=r.today||'';
      $('#ad-slots').innerHTML=Object.keys(ads.slots).map(function(k){ var n=ads.items.filter(function(a){ return a.slot===k && adState(a)[0]==='게재 중'; }).length; return '<div class="kpi" style="cursor:default"><small>'+esc(ads.slots[k])+'</small><b>'+n+'</b><span class="tiny muted">'+(n?'게재 중':'메가스팟 안내 배너 표시')+'</span></div>'; }).join('');
      box.innerHTML=ads.items.length?ads.items.map(function(a){ var s=adState(a), d=a.data||{}, ctr=a.imps?(a.clicks/a.imps*100).toFixed(1)+'%':'-';
        return '<div class="adm-row pf-row" data-pref="'+a.id+'" tabindex="0"><div class="r1"><b>'+esc(a.title)+'</b><span class="tag-k '+(a.kind==='paid'?'ad':'')+'">'+(a.kind==='paid'?'광고 · '+esc(a.advertiser||''):'메가스팟 안내')+'</span><span class="small muted">'+esc(ads.slots[a.slot]||a.slot)+'</span><span class="st '+s[1]+'">'+s[0]+'</span></div>'
          +'<div class="r2">'+esc(d.sub||'')+'</div><div class="r3"><span class="ad-stat">노출 '+M.fmtNum(a.imps)+' · 클릭 '+M.fmtNum(a.clicks)+' · 클릭률 '+ctr+' · 우선순위 '+a.priority+'</span><span>'+esc((a.start_date||'시작일 없음')+' ~ '+(a.end_date||'종료일 없음'))+' <button class="btn btn-light btn-xs" type="button" data-adtoggle="'+a.id+'" data-on="'+(a.status==='on'?1:0)+'">'+(a.status==='on'?'끄기':'켜기')+'</button></span></div></div>'; }).join('')
        :X.emptyMsg('등록한 배너가 없습니다. 지금은 모든 자리에 메가스팟 안내 배너(건대 1호·2호·모임 모집·공간 등록)가 보입니다.');
    }).catch(X.fail(box));
  }
  function adPreview(f){
    var d=M.formData(f), slot=d.slot||'home-mid';
    var a={ kind:d.kind, title:d.title||'배너 제목', sub:d.sub, cta:d.cta, advertiser:d.advertiser, image:d.image, theme:d.theme, href:'#' };
    $('#pf-adprev').innerHTML='<div data-ad-slot="'+esc(slot)+'" class="ad-on" style="'+(slot==='list-card'?'max-width:320px':'')+'">'+M.ads.html(a, slot)+'</div>';
    var l=$('#pf-adprev a'); if(l){ l.removeAttribute('href'); l.removeAttribute('target'); }
  }
  function openAd(id){
    var a=id?ads.items.filter(function(x){ return String(x.id)===String(id); })[0]:null; a=a||{ slot:'home-mid', kind:'paid', status:'off', priority:0, data:{ theme:'cobalt' } };
    var d=a.data||{};
    drawer(a.id?'배너 #'+a.id:'새 배너', '<form class="form" id="pf-aform" novalidate>'
      +'<div class="field-row"><div class="f"><label>자리</label><select class="select" name="slot">'+opts(Object.keys(ads.slots).map(function(k){ return [k, ads.slots[k]]; }), a.slot)+'</select></div><div class="f"><label>종류</label><select class="select" name="kind">'+opts([['paid','유료 광고 (\'광고\' 표시)'],['house','메가스팟 안내']], a.kind)+'</select></div></div>'
      +'<div class="f"><label>제목 <span class="req">*</span></label><input class="input" name="title" maxlength="60" required value="'+esc(a.title||'')+'"></div>'
      +'<div class="f"><label>보조 문구</label><input class="input" name="sub" maxlength="120" value="'+esc(d.sub||'')+'"></div>'
      +'<div class="field-row"><div class="f"><label>버튼 문구</label><input class="input" name="cta" maxlength="20" value="'+esc(d.cta||'')+'" placeholder="자세히 보기"></div><div class="f"><label>광고주 (유료 광고 필수)</label><input class="input" name="advertiser" maxlength="60" value="'+esc(a.advertiser||'')+'"></div></div>'
      +'<div class="f"><label>연결 주소 <span class="req">*</span> (https:// 또는 /로 시작하는 홈페이지 경로)</label><input class="input" name="link" maxlength="500" required value="'+esc(a.link||'')+'"></div>'
      +'<div class="field-row"><div class="f"><label>이미지 주소 (선택 · 가로형)</label><input class="input" name="image" maxlength="500" value="'+esc(d.image||'')+'" placeholder="https:// 또는 /assets/img/…"></div><div class="f"><label>색</label><select class="select" name="theme">'+opts([['cobalt','코발트'],['graphite','진회색'],['rust','러스트'],['light','흰색']], d.theme||'cobalt')+'</select></div></div>'
      +'<div class="field-row three"><div class="f"><label>게재 시작일</label><input class="input" type="date" name="start_date" value="'+esc(a.start_date||'')+'"></div><div class="f"><label>게재 종료일</label><input class="input" type="date" name="end_date" value="'+esc(a.end_date||'')+'"></div><div class="f"><label>우선순위 (0~100)</label><input class="input" type="number" name="priority" min="0" max="100" value="'+esc(a.priority||0)+'"></div></div>'
      +'<div class="f"><label>상태</label><select class="select" name="status">'+opts([['off','꺼짐 (저장만)'],['on','켜짐 (기간 안이면 게재)']], a.status)+'</select></div>'
      +'<div class="f"><label>운영 메모 (계약 내용 등 · 공개되지 않음)</label><textarea class="textarea" name="memo" rows="2" maxlength="500">'+esc(d.memo||'')+'</textarea></div>'
      +'<div class="f"><span class="lbl">미리보기</span><div class="ad-prev" id="pf-adprev"></div></div>'
      +'<div class="form-note" id="pf-amsg" hidden></div><div class="row" style="gap:6px"><button class="btn btn-primary btn-sm" type="submit">저장</button>'+(a.id?'<button class="btn btn-light btn-sm" type="button" id="pf-adel" style="color:var(--rust)">배너 삭제</button>':'')+'</div></form>');
    var f=$('#pf-aform'); adPreview(f); f.addEventListener('input', function(){ adPreview(f); }); f.addEventListener('change', function(){ adPreview(f); });
    f.addEventListener('submit', function(e){ e.preventDefault(); var msg=$('#pf-amsg'); msg.hidden=true; if(!M.validate(f)) return;
      (a.id?A('/ads/'+a.id,{ method:'PUT', body:M.formData(f) }):A('/ads',{ method:'POST', body:M.formData(f) })).then(function(){ M.toast('저장했습니다. 홈페이지에는 1분 안에 반영됩니다.'); closeD(); loadAds(); }).catch(function(x){ if(!X.guard(x)){ msg.textContent=x.message; msg.hidden=false; } }); });
    var del=$('#pf-adel'); if(del) del.addEventListener('click', function(){ if(!confirm('이 배너를 삭제할까요? 노출·클릭 기록도 함께 지워집니다. 잠시 내리려면 상태를 꺼짐으로 바꾸세요.')) return; A('/ads/'+a.id,{ method:'DELETE' }).then(function(){ M.toast('삭제했습니다.'); closeD(); loadAds(); }).catch(oops); });
  }
  $('#ad-reload').addEventListener('click', loadAds);
  $('#ad-new').addEventListener('click', function(){ if(!Object.keys(ads.slots).length){ A('/ads').then(function(r){ ads.slots=r.slots||{}; openAd(null); }).catch(oops); } else openAd(null); });
  $('#ad-admin-list').addEventListener('click', function(e){
    var t=e.target.closest('[data-adtoggle]'); if(t){ e.stopPropagation(); A('/ads/'+t.dataset.adtoggle,{ method:'PATCH', body:{ status:t.dataset.on==='1'?'off':'on' } }).then(function(){ M.toast(t.dataset.on==='1'?'배너를 껐습니다.':'배너를 켰습니다.'); loadAds(); }).catch(oops); return; }
    if(e.target.closest('a,button')) return; var r=e.target.closest('[data-pref]'); if(r) openAd(r.dataset.pref);
  });
  $('#ad-admin-list').addEventListener('keydown', function(e){ keyRow(e, openAd); });

  X.register('hosts', loadHosts); X.register('listings', loadListings); X.register('meetups', loadMeetups); X.register('ads', loadAds);
  // 관리자 화면이 이 파일보다 먼저 열렸고 주소가 플랫폼 화면이면 다시 엽니다
  var v=location.hash.replace('#',''); if(X.visible() && ['hosts','listings','meetups','ads'].indexOf(v)>=0) X.go(v);
})();
