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
    var cover = M.photoSrc(s.id, s.cover, !opt.wide);
    var feats = (s.features||[]).slice(0, opt.wide?8:4).map(function(f){ return '<span class="tag">'+esc(FEAT[f]||f)+'</span>'; }).join('');
    var purs = (s.purposes||[]).slice(0, opt.wide?6:3).map(function(p){ return esc(PUR[p]||p); }).join(' · ');
    var status = s.status==='open' ? '<span class="badge badge-ok">문의 가능</span>' : '<span class="badge badge-soft">준비 중</span>';
    return '<a class="space-card'+(opt.wide?' wide':'')+'" href="'+url+'">'
      + '<div class="ph"><img src="'+cover+'" alt="'+esc(s.name)+' 대표 사진" loading="lazy">'+typeBadge(s)+'</div>'
      + '<div class="bd">'
      + '<div class="row between"><h3>'+esc(s.name)+'</h3>'+status+'</div>'
      + '<div class="loc">'+esc(s.addressShort||s.address)+'</div>'
      + (opt.wide ? '<p class="mt-2" style="font-size:15px;color:var(--ink-2);line-height:1.7">'+esc(s.summary)+'</p>' : '<p class="mt-1 small muted">'+esc(s.tagline)+'</p>')
      + '<div class="specs">'
      + '<span><b>'+esc(s.area.pyeong)+'</b>평</span>'
      + '<span>최대 <b>'+esc(s.capacity.max)+'</b>명</span>'
      + '<span>H <b>'+(s.ceiling.mm/1000).toFixed(1)+'</b>m</span>'
      + '</div>'
      + '<div class="tags mt-2">'+feats+'</div>'
      + '<div class="foot"><span class="muted">'+purs+'</span><span style="font-weight:700;color:var(--cobalt)">자세히 보기 →</span></div>'
      + '</div></a>';
  };

  M.purposeCard = function(p, opt){
    opt = opt||{};
    var href = opt.href || ('/spaces/?purpose='+p.id);
    return '<a class="card card-link" href="'+href+'">'
      + '<div class="eyebrow">'+esc(p.en)+'</div>'
      + '<h3 class="mt-1">'+esc(p.label)+'</h3>'
      + '<p class="meta">'+esc(p.desc)+'</p>'
      + '<div class="mt-2" style="font-weight:700;color:var(--cobalt);font-size:14px">이 목적의 공간 보기 →</div>'
      + '</a>';
  };
})();
