/* 공간 카드 · 목적 카드 공용 렌더러 */
(function(){
  var M = window.MEGASPOT, esc = M.esc;
  var FEAT = {}; (window.MEGASPOT_FEATURES||[]).forEach(function(f){ FEAT[f.id]=f.label; });
  var PUR = {}; (window.MEGASPOT_PURPOSES||[]).forEach(function(p){ PUR[p.id]=p.label; });

  function typeBadge(s){
    if(s.type==='direct') return '<span class="badge badge-direct">직영 · 메가스팟 운영</span>';
    if(s.type==='managed') return '<span class="badge badge-rust">메가스팟 운영 위탁</span>';
    return '<span class="badge badge-host">외부 호스트</span>';
  }

  M.spaceCard = function(s, opt){
    opt = opt || {};
    var url = '/spaces/'+s.slug+'/';
    var cover = M.imgSrc(s.cover, opt.wide ? 'm' : 't');
    var feats = (s.features||[]).slice(0, opt.wide?8:4).map(function(f){ return '<span class="tag">'+esc(FEAT[f]||f)+'</span>'; }).join('');
    var plim = opt.wide?5:3, pall=(s.purposes||[]);
    var purs = pall.slice(0, plim).map(function(p){ return esc(PUR[p]||p); }).join(' · ') + (pall.length>plim ? ' 외 '+(pall.length-plim)+'가지' : '');
    var status = s.status==='open' ? '<span class="badge badge-ok">'+esc(s.statusLabel||'문의 가능')+'</span>' : s.status==='opening' ? '<span class="badge badge-cobalt">'+esc(s.statusLabel||'오픈 예정 · 사전 예약')+'</span>' : '<span class="badge badge-soft">준비 중</span>';
    var cgNote = s.renders ? '<span class="ph-note">완공 예상 이미지</span>' : '';
    return '<a class="space-card'+(opt.wide?' wide':'')+'" href="'+url+'">'
      + '<div class="ph"><img src="'+cover+'" alt="'+esc(s.name)+' 대표 이미지'+(s.renders?' (완공 예상 이미지)':'')+'" loading="lazy">'+typeBadge(s)+cgNote+M.tagHtml(s.cover)+'</div>'
      + '<div class="bd">'
      + '<div class="row between"><h3>'+esc(s.name)+'</h3>'+status+'</div>'
      + '<div class="loc">'+esc(s.addressShort||s.address)+'</div>'
      + (opt.wide ? '<p class="mt-2" style="font-size:15px;color:var(--ink-2);line-height:1.7">'+esc(s.summary)+'</p>' : '<p class="mt-1 small muted">'+esc(s.tagline)+'</p>')
      + '<div class="specs">'
      + '<span><b>'+esc(s.area.pyeong)+'</b>평</span>'
      + '<span>최대 <b>'+esc(s.capacity.max)+'</b>명</span>'
      + (s.ceiling && s.ceiling.mm ? '<span>H <b>'+(s.ceiling.mm/1000).toFixed(1)+'</b>m</span>' : (s.capacity.base ? '<span>기준 <b>'+esc(s.capacity.base)+'</b>명 포함</span>' : ''))
      + (s.price ? '<span class="price">시간당 <b>'+M.fmtNum(s.price.from/10000)+'</b>만 원부터</span>' : '')
      + '</div>'
      + '<div class="tags mt-2">'+feats+'</div>'
      + '<div class="foot"><span class="muted">'+purs+'</span><span style="font-weight:700;color:var(--cobalt)">자세히 보기 →</span></div>'
      + '</div></a>';
  };

  // 등록 공간(외부 호스트 공간 · 문의형) 카드 — 관리자가 공개한 공간 (/api/listings/list)
  var REG = {}; (window.MEGASPOT_REGIONS||[]).forEach(function(r){ REG[r.id]=r.label.replace(/\s*\(.*\)$/,''); });
  M.listingCard = function(l){
    var url = '/spaces/listing/?id='+encodeURIComponent(l.id);
    var ph = l.photos && l.photos[0] ? '<img src="'+esc(M.coverSrc(l.photos[0]))+'" alt="'+esc(l.name)+' 대표 사진" loading="lazy" referrerpolicy="no-referrer">' : '<span class="ph-blank" aria-hidden="true"><b>'+esc(l.name)+'</b><small>사진 준비 중</small></span>';
    var feats = (l.features||[]).slice(0,4).map(function(f){ return '<span class="tag">'+esc(FEAT[f]||f)+'</span>'; }).join('');
    var purs = (l.purposes||[]).slice(0,3).map(function(p){ return esc(PUR[p]||p); }).join(' · ');
    return '<a class="space-card is-listing" href="'+url+'">'
      + '<div class="ph">'+ph+'<span class="badge badge-host">외부 호스트</span></div>'
      + '<div class="bd"><div class="row between"><h3>'+esc(l.name)+'</h3><span class="badge badge-soft">문의형</span></div>'
      + '<div class="loc">'+esc([REG[l.region]||'', l.address].filter(Boolean).join(' · '))+'</div>'
      + (l.summary ? '<p class="mt-1 small muted">'+esc(l.summary)+'</p>' : '')
      + '<div class="specs">'+(l.area?'<span><b>'+esc(l.area)+'</b>평</span>':'')+(l.capacity?'<span>최대 <b>'+esc(l.capacity)+'</b>명</span>':'')+(l.price_note?'<span class="price">'+esc(l.price_note)+'</span>':'')+'</div>'
      + '<div class="tags mt-2">'+feats+'</div>'
      + '<div class="foot"><span class="muted">'+(purs||'조건 확인 후 견적')+'</span><span style="font-weight:700;color:var(--cobalt)">자세히 보기 →</span></div>'
      + '</div></a>';
  };

  // 모임 카드 — /api/meetups/list 항목
  M.meetupBadge = function(m){
    var left = m.capacity ? m.capacity - (m.seats||0) : null;
    if(m.status==='cancelled') return '<span class="badge badge-soft">모임 취소</span>';
    if(m.status==='done') return '<span class="badge badge-soft">종료</span>';
    if(m.status==='closed') return '<span class="badge badge-soft">모집 마감</span>';
    if(left!==null && left<=0) return '<span class="badge badge-warn">정원 마감 · 대기 신청</span>';
    if(left!==null && m.capacity && left/m.capacity<=0.2) return '<span class="badge badge-warn">마감 임박</span>';
    return '<span class="badge badge-ok">모집 중</span>';
  };
  M.feeText = function(m){ return m.fee_type==='paid' ? (m.fee ? M.fmtNum(m.fee)+'원' : '유료') : '무료'; };
  M.meetupWhere = function(m){ return m.venue==='other' ? (m.venue_text||'다른 장소') : (m.venue_label||'장소 협의 중'); };
  M.meetupCard = function(m, opt){
    opt = opt||{};
    var url = '/meetups/view/?id='+encodeURIComponent(m.ref);
    var pct = m.capacity ? Math.min(100, Math.round((m.seats||0)/m.capacity*100)) : 0;
    var minMark = m.capacity && m.min_people ? '<i class="min" style="left:'+Math.min(100, Math.round(m.min_people/m.capacity*100))+'%" title="최소 진행 인원 '+esc(m.min_people)+'명"></i>' : '';
    var when = M.fmtKDate(m.date)+(m.start_time?' '+m.start_time:'');
    return '<a class="mt-card'+(m.featured?' is-featured':'')+'" href="'+url+'">'
      + '<div class="ph"><img src="'+esc(M.coverSrc(m.cover,'m'))+'" alt="" loading="lazy" referrerpolicy="no-referrer">'+M.meetupBadge(m)+'<span class="mt-cat">'+esc(m.cat_label||'')+'</span>'+(m.featured?'<span class="mt-pick">추천</span>':'')+'</div>'
      + '<div class="bd">'
      + '<div class="mt-when">'+esc(when)+'</div>'
      + '<h3>'+esc(m.title)+'</h3>'
      + (m.summary?'<p class="mt-sum">'+esc(m.summary)+'</p>':'')
      + '<div class="mt-meta"><span>'+esc(M.meetupWhere(m))+'</span><span>'+esc(M.feeText(m))+'</span>'+(m.verified?'<span class="mt-ok">메가스팟 예약 확인</span>':'')+'</div>'
      + (m.capacity?'<div class="mt-bar" role="img" aria-label="정원 '+esc(m.capacity)+'명 중 '+esc(m.seats||0)+'명 신청"><i style="width:'+pct+'%"></i>'+minMark+'</div>':'')
      + '<div class="mt-foot"><span>신청 <b>'+esc(m.seats||0)+'</b>'+(m.capacity?' / '+esc(m.capacity)+'명':'명')+(m.waiting?' · 대기 '+esc(m.waiting):'')+'</span><span class="by">'+esc(m.host_name||'')+'</span></div>'
      + '</div></a>';
  };

  // 목적 카드 — cover가 있으면 사진 카드로 그립니다
  M.purposeCard = function(p, opt){
    opt = opt||{};
    var href = opt.href || ('/purpose/'+p.id+'/');
    if(p.cover){
      return '<a class="pcard" href="'+href+'">'
        + '<div class="ph"><img src="'+M.imgSrc(p.cover,'m')+'" alt="'+esc(p.label)+' — 메가스팟 건대 1호" loading="lazy">'+M.tagHtml(p.cover)+'</div>'
        + '<div class="bd"><div class="eyebrow">'+esc(p.en)+'</div><h3>'+esc(p.label)+'</h3><p>'+esc(p.desc)+'</p><span class="go">'+esc(opt.go||'어떻게 쓰는지 보기')+' →</span></div>'
        + '</a>';
    }
    return '<a class="card card-link" href="'+href+'">'
      + '<div class="eyebrow">'+esc(p.en)+'</div>'
      + '<h3 class="mt-1">'+esc(p.label)+'</h3>'
      + '<p class="meta">'+esc(p.desc)+'</p>'
      + '<div class="mt-2" style="font-weight:700;color:var(--cobalt);font-size:14px">이 목적의 공간 보기 →</div>'
      + '</a>';
  };
})();
