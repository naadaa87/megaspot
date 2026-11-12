/* 문서 내려받기(/docs/) — 견적서 · 공간소개서 · 행사기획서를 그 자리에서 만들어 PDF로 저장합니다.
   ?type=quote|space|plan 과 함께
     code=HB-…&k=…            예약 요청 기준 (견적서 · 행사기획서 · 공간소개서)
     id=SP-…[&date&start&end&people&mode&pkg&opt=0:2,1:1&addons=buffet,mc]   공간 기준 (예상 견적서 · 행사기획서(안) · 공간소개서)
     pl=PL-…&k=…              행사 준비 맡기기 요청 기준 (행사기획서)
   PDF는 assets/js/vendor/html2pdf.bundle.min.js 로 만들고, 인쇄 버튼은 브라우저 인쇄(PDF로 저장 가능)를 엽니다. */
(function(){
  'use strict';
  var M=window.MEGASPOT, S=window.MSP; if(!M||!S) return;
  var $=M.$, esc=M.esc, won=S.won, P=S.P, q=S.qs(), el=$('#doc'); if(!el) return;
  var type=({ quote:1, space:1, plan:1 })[q.get('type')]?q.get('type'):'quote';
  var code=(q.get('code')||'').toUpperCase(), k=q.get('k')||'', id=(q.get('id')||'').toUpperCase(), pl=(q.get('pl')||'').toUpperCase();
  var D={ space:null, booking:null, addons:[], est:null, sel:null, planning:null }, TODAY=S.today();
  var NAME={ quote:'견적서', space:'공간소개서', plan:'행사기획서' };
  function nl(t){ return esc(t||'').replace(/\n/g,'<br>'); }
  function kd(iso){ return iso?String(iso).slice(0,4)+'년 '+M.fmtKDate(String(iso).slice(0,10)):''; }
  function addDays(iso, n){ var d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return M.fmtDate(d); }
  function hm(t){ var m=/^(\d{2}):(\d{2})$/.exec(t||''); return m?+m[1]*60+ +m[2]:null; }
  function tm(n){ n=((n%1440)+1440)%1440; return M.pad2(Math.floor(n/60))+':'+M.pad2(n%60); }
  function dayRate(o, unit){ if(!o) return ''; var a=o.weekday, b=o.weekend; if(a==null&&b==null) return ''; return (a!=null?'평일 '+won(a):'')+(a!=null&&b!=null?' · ':'')+(b!=null?'주말·공휴일 '+won(b):'')+(unit||''); }
  function stop(msg){ $('#doc-loading').innerHTML=esc(msg)+'<div class="row mt-2" style="justify-content:center"><a class="btn btn-light btn-sm" href="/spaces/">공간 찾기</a></div>'; }
  function head(title, sub, no){ return '<header class="doc-head"><div><div class="doc-brand">MEGA<b>SPOT</b></div><h1>'+title+'</h1>'+(sub?'<p>'+sub+'</p>':'')+'</div><dl>'+(no?'<dt>문서번호</dt><dd>'+esc(no)+'</dd>':'')+'<dt>작성일</dt><dd>'+esc(kd(TODAY))+'</dd></dl></header>'; }
  function foot(extra){ return '<footer class="doc-foot">'+(extra?'<p>'+extra+'</p>':'')+'<p>이 문서는 메가스팟(megaspot.kr)에서 자동으로 만들어졌습니다. 입점 공간의 이용 계약과 결제는 고객과 호스트 사이에서 이뤄지며, 메가스팟은 통신판매중개자로서 결제 수수료를 받지 않습니다.</p></footer>'; }
  function kv(rows){ rows=rows.filter(function(r){ return r && r[1]; }); return rows.length?'<table class="doc-kv"><tbody>'+rows.map(function(r){ return '<tr><th>'+esc(r[0])+'</th><td>'+r[1]+'</td></tr>'; }).join('')+'</tbody></table>':''; }
  function sect(title, html){ return html?'<section class="doc-sec"><h2>'+esc(title)+'</h2>'+html+'</section>':''; }
  function whenText(o){ return [o.date?kd(o.date):'날짜 미정', S.timeRange(o.start, o.end), o.people?o.people+'명':''].filter(Boolean).join(' · '); }
  function modeText(sel, sp){ var p=(sp&&sp.price)||{}; return !sel?'':sel.mode==='hourly'?'시간 대관':sel.mode==='package'?'패키지'+(((p.packages||[])[sel.pkg]||{}).name?' · '+p.packages[sel.pkg].name:''):sel.mode==='daily'?'하루 대관':'견적 문의'; }
  function seller(sp){ var s=(sp&&sp.seller)||{}; return kv([['상호', esc(s.company||'')],['대표자', esc(s.ceo||'')],['사업자등록번호', esc(s.biz_no||'')],['주소', esc((sp&&(sp.address_full||sp.address))||'')],['연락처', esc((sp&&sp.contact&&sp.contact.phone)||'')]]); }
  function addonLabel(a){ return (S.ADD[a]||{}).label||a; }

  /* ---------- 자료 불러오기 ---------- */
  function load(){
    if(/^PL-/.test(pl)) return M.api('/planning?ref='+encodeURIComponent(pl)+'&k='+encodeURIComponent(k)).then(function(r){ D.planning=r.item; type='plan'; });
    if(/^HB-/.test(code)) return M.api('/venues/booking?code='+encodeURIComponent(code)+'&k='+encodeURIComponent(k)).then(function(r){
      D.booking=r.booking; D.space=r.space; D.addons=r.hq_addons||[]; k=r.k;
      return M.api('/venues/item/'+encodeURIComponent(r.space.id)).then(function(i){ var c=D.space.contact; D.space=i.space; if(c&&c.phone&&!(D.space.contact||{}).phone) D.space.contact=Object.assign({}, D.space.contact, { phone:c.phone }); }).catch(function(){}); });
    if(/^SP-/.test(id)) return M.api('/venues/item/'+encodeURIComponent(id)).then(function(r){
      D.space=r.space; TODAY=r.today||TODAY;
      var opt=(q.get('opt')||'').split(',').map(function(x){ var p=x.split(':'); return { i:+p[0], qty:+p[1]||1 }; }).filter(function(o){ return q.get('opt') && o.i>=0; });
      D.sel={ date:q.get('date')||'', start:q.get('start')||'', end:q.get('end')||'', people:q.get('people')||'', mode:q.get('mode')||'', pkg:+q.get('pkg')||0, options:opt, addons:(q.get('addons')||'').split(',').filter(function(a){ return S.ADD[a]; }) };
      if(type==='space' && !D.sel.date && !D.sel.mode) return;
      return M.api('/venues/estimate', { method:'POST', body:{ ref:id, date:D.sel.date, start:D.sel.start, end:D.sel.end, people:D.sel.people, select:{ mode:D.sel.mode, pkg:D.sel.pkg, options:opt } } }).then(function(e){ D.est=e.estimate; }).catch(function(){}); });
    return Promise.reject({ message:'문서를 만들 정보가 없습니다. 공간 상세나 예약 조회 화면에서 다시 열어 주세요.' });
  }

  /* ---------- 견적서 ---------- */
  function quoteDoc(){
    var b=D.booking, sp=D.space, qt=b&&b.quote, est=b?b.estimate:(D.est&&D.est.ok?D.est:null), fixed=!!qt || (b && b.amount!=null && ['pending','confirmed','done'].indexOf(b.status)>=0);
    var rows=qt?qt.lines:est?est.lines.concat(est.vat?[{ label:'부가세', desc:'10%', amount:est.vat }]:[]):[], total=qt?qt.total:est?est.total:null;
    if(b && !qt && b.amount!=null && fixed && (!est || est.total!==b.amount)){ rows=[{ label:'공간 이용료', desc:'호스트 확정 금액', amount:b.amount }]; total=b.amount; est=null; }
    var w=b?{ date:b.date, start:b.start, end:b.end, people:b.people }:D.sel, title=fixed?'견 적 서':'예상 견적서';
    var valid=qt&&qt.valid_until?kd(qt.valid_until)+'까지':kd(addDays(TODAY, 7))+'까지 (요금표 기준)';
    var pay=(sp.payment||{}), adds=b?(D.addons||[]).map(function(a){ return a.label+(a.amount?' '+won(a.amount):''); }):(D.sel.addons||[]).map(addonLabel);
    return head(title, esc(sp.name)+' 이용 견적', b?b.code:'EST-'+TODAY.replace(/-/g,'').slice(2)+'-'+sp.id.slice(-4))
      +'<div class="doc-two"><section class="doc-sec"><h2>받는 분</h2>'+(b?kv([['이름', esc(b.name)+' 귀하'],['소속', esc(b.org||'')],['연락처', esc(b.phone||'')]]):'<p class="doc-lg">귀하</p>')+'</section>'
      +'<section class="doc-sec"><h2>공급자 (호스트)</h2>'+seller(sp)+'</section></div>'
      +sect('이용 내용', kv([['공간', esc(sp.name)+' <small>'+esc(sp.address_full||sp.address)+'</small>'],['이용 일시', esc(whenText(w))],['이용 방식', esc(b?'':modeText(D.sel, sp))],['모임', esc((b&&b.purpose_label)||'')]]))
      +'<section class="doc-sec"><h2>견적 금액</h2>'+(rows.length?'<table class="doc-table"><thead><tr><th>항목</th><th>내용</th><th class="r">금액</th></tr></thead><tbody>'+rows.map(function(l){ return '<tr><td>'+esc(l.label)+'</td><td>'+esc(l.desc||'')+'</td><td class="r">'+esc(won(l.amount))+'</td></tr>'; }).join('')
        +'</tbody><tfoot><tr><td colspan="2">합계'+((qt?false:est&&est.vat_mode==='included')?' (부가세 포함)':'')+'</td><td class="r">'+esc(won(total))+'</td></tr></tfoot></table>'
        +(est&&est.deposit&&!qt?'<p class="doc-note">보증금 '+esc(won(est.deposit))+'은 별도이며, 이용 후 이상이 없으면 돌려받습니다.</p>':'')+(qt&&qt.note?'<p class="doc-note">'+nl(qt.note)+'</p>':'')
        +(w.people&&total?'<p class="doc-note">1인당 '+esc(won(Math.round(total/w.people)))+' ('+esc(String(w.people))+'명 기준)</p>':'')
        :'<p>요금표로 계산되지 않는 조건입니다. 호스트가 일정과 조건을 확인한 뒤 견적을 보내 드립니다.</p>')+'</section>'
      +(adds.length?sect('메가스팟 부가서비스 (별도)', '<p>'+esc(adds.join(' · '))+'</p><p class="doc-note">메가스팟 본사가 준비하는 서비스로, 위 금액에 들어 있지 않습니다. 메가스팟 담당자가 따로 견적을 안내합니다.</p>'):'')
      +sect('안내', kv([['견적 유효기간', esc(valid)],['결제 방법', esc((pay.methods||[]).map(function(m){ return S.PAY[m]||m; }).join(' · ')||'호스트 안내')+(pay.deposit_pct?' · 예약금 '+pay.deposit_pct+'%':'')+(pay.tax_invoice?' · 세금계산서 발행 가능':'')],['환불 규정', nl(S.refundText(sp.refund))]]))
      +foot(fixed?'':'예상 견적서는 공간 요금표로 자동 계산한 금액입니다. 호스트가 일정과 조건을 확인한 뒤 금액이 확정됩니다.');
  }

  /* ---------- 공간소개서 ---------- */
  function priceRows(sp){
    var p=sp.price||{}, m=p.modes||[], rows=[];
    if(m.indexOf('hourly')>=0&&p.hourly) rows.push(['시간 대관', dayRate(p.hourly,' (시간당)')+((p.hourly.min_hours||1)>1?' · 최소 '+p.hourly.min_hours+'시간':'')]);
    if(m.indexOf('package')>=0) (p.packages||[]).forEach(function(x){ rows.push(['패키지 · '+x.name, dayRate(x)+(x.time?' · '+x.time:'')]); });
    if(m.indexOf('daily')>=0&&p.daily) rows.push(['하루 대관', dayRate(p.daily)]);
    if(p.base_people&&p.extra_per_person) rows.push(['인원 추가', '기준 '+p.base_people+'명 초과 1명당 '+won(p.extra_per_person)]);
    if(p.deposit) rows.push(['보증금', won(p.deposit)]);
    return rows;
  }
  function spaceDoc(){
    var sp=D.space, ph=sp.photos||[], lay=sp.layouts||{}, pk=sp.parking||{}, ru=sp.rules||{}, p=sp.price||{}, pr=priceRows(sp);
    var lays=[['standing','스탠딩'],['theater','강연식'],['classroom','강의식'],['banquet','연회식']].filter(function(x){ return lay[x[0]]; }).map(function(x){ return x[1]+' '+lay[x[0]]+'명'; });
    var rule=[ru.food?'외부 음식 반입 '+({ok:'가능',limited:'일부 가능 (협의)',no:'불가'}[ru.food]||''):'', ru.alcohol?'주류 '+({ok:'가능',no:'불가'}[ru.alcohol]||''):''].filter(Boolean).join(' · ');
    return head('공간소개서', esc(S.tierLabel(sp.tier))+' · '+esc((sp.type_labels||[]).join(' · ')), sp.id)
      +'<section class="doc-hero">'+(ph[0]?'<img src="'+esc(ph[0].src)+'" alt="'+esc(sp.name)+' 대표 사진">':'')+'<div><h2>'+esc(sp.name)+'</h2>'+(sp.summary?'<p>'+esc(sp.summary)+'</p>':'')+'<p class="doc-note">'+esc([sp.address_full||sp.address, sp.station].filter(Boolean).join(' · '))+'</p></div></section>'
      +'<div class="doc-stats">'+[['면적', sp.area?sp.area+'평':''],['최대 인원', sp.capacity?sp.capacity+'명':''],['층고', sp.ceiling?sp.ceiling+'m':''],['운영 시간', sp.hours],['주차', pk.count!=null?pk.count+'대':'']].filter(function(x){ return x[1]; }).map(function(x){ return '<div><span>'+x[0]+'</span><b>'+esc(x[1])+'</b></div>'; }).join('')+'</div>'
      +sect('공간 소개', '<p>'+nl(sp.intro)+'</p>')
      +(ph.length>1?'<section class="doc-sec doc-avoid"><h2>사진</h2><div class="doc-photos">'+ph.slice(1,7).map(function(x, i){ return '<img src="'+esc(x.src)+'" alt="'+esc(sp.name)+' 사진 '+(i+2)+'">'; }).join('')+'</div></section>':'')
      +sect('요금', (pr.length?kv(pr.map(function(r){ return [r[0], esc(r[1])]; }))+'<p class="doc-note">'+(p.vat==='excluded'?'부가세 별도 금액입니다.':'부가세 포함 금액입니다.')+' 금액은 호스트가 일정과 조건을 확인한 뒤 확정합니다.</p>':'<p>요금은 일정과 조건을 확인한 뒤 호스트가 견적으로 안내합니다.</p>')+(p.note?'<p class="doc-note">'+nl(p.note)+'</p>':''))
      +sect('옵션 (호스트 제공)', (sp.options||[]).length?kv(sp.options.map(function(o){ return [o.name, esc(won(o.price))+' / '+esc(o.unit)]; })):'')
      +sect('시설·장비', (sp.facility_labels||[]).length?'<p>'+esc(sp.facility_labels.join(' · '))+'</p>':'')
      +sect('수용 인원·이용 규정', kv([['배치별 인원', esc(lays.join(' · '))],['주차', esc([pk.count!=null?pk.count+'대':'', pk.note].filter(Boolean).join(' · '))],['음식·주류', esc(rule)],['주의사항', nl(ru.note)],['환불 규정', nl(S.refundText(sp.refund))]]))
      +sect('메가스팟 부가서비스', '<p>'+esc(P.addons.map(function(a){ return a.label; }).join(' · '))+'</p><p class="doc-note">메가스팟 본사가 준비하는 서비스로, 이 공간을 예약할 때 함께 신청할 수 있습니다.</p>')
      +'<div class="doc-two">'+sect('호스트', seller(sp))+sect('예약·문의', '<p class="doc-lg">megaspot.kr/spaces/view/?id='+esc(sp.id)+'</p><p class="doc-note">메가스팟에서 날짜와 인원을 넣으면 예상 금액을 바로 확인하고 예약을 요청할 수 있습니다. 결제 수수료는 없습니다.</p>')+'</div>'
      +foot();
  }

  /* ---------- 행사기획서 ---------- */
  function timeline(start, end, food){
    var s=hm(start), e=hm(end); if(s===null||e===null) return [['행사 전','세팅·리허설 (입실 시간은 호스트와 협의)'],['시작','참석자 입장·접수'],['본 행사','진행 순서를 적어 주세요'],['마무리','정리·퇴실']];
    if(e<=s) e+=1440; var len=e-s, rows=[[tm(s-60)+'~'+tm(s), '세팅·리허설 (입실 시간은 호스트와 협의)']], t=s, open=Math.min(30, Math.round(len*0.15/10)*10||10), close=Math.min(30, Math.round(len*0.12/10)*10||10);
    rows.push([tm(t)+'~'+tm(t+open), '참석자 입장·접수']); t+=open;
    if(food && len>=180){ var mid=Math.round((e-close-t)*0.55/10)*10, meal=len>=300?60:40; rows.push([tm(t)+'~'+tm(t+mid), '본 행사 1부']); t+=mid; rows.push([tm(t)+'~'+tm(t+meal), '식사·교류']); t+=meal; rows.push([tm(t)+'~'+tm(e-close), '본 행사 2부']); }
    else rows.push([tm(t)+'~'+tm(e-close), '본 행사']);
    rows.push([tm(e-close)+'~'+tm(e), '마무리·정리·퇴실']); return rows;
  }
  function checklist(date){
    var rows=[[14,'견적 확정, 예약금 결제, 행사 순서 초안'],[7,'참석 인원 확정, 식음료 수량·메뉴 확정, 제작물 시안 확인'],[3,'진행 순서·좌석 배치·장비 최종 확인, 주차·반입 안내 공유'],[0,'세팅·리허설, 접수 준비, 종료 후 정리와 보증금 확인']];
    return '<table class="doc-table"><thead><tr><th style="width:26%">시점</th><th>할 일</th><th style="width:12%">확인</th></tr></thead><tbody>'+rows.map(function(r){ return '<tr><td>'+(r[0]?'D-'+r[0]:'행사 당일')+(date?' <small>'+esc(M.fmtKDate(addDays(date, -r[0])))+'</small>':'')+'</td><td data-edit>'+r[1]+'</td><td>☐</td></tr>'; }).join('')+'</tbody></table>';
  }
  function planDoc(){
    if(D.planning) return planReqDoc();
    var b=D.booking, sp=D.space, w=b?{ date:b.date, start:b.start, end:b.end, people:b.people }:D.sel, qt=b&&b.quote, est=b?b.estimate:(D.est&&D.est.ok?D.est:null);
    var adds=b?(D.addons||[]).map(function(a){ return { id:a.service, label:a.label, status:a.status_label, amount:a.amount }; }):(D.sel.addons||[]).map(function(a){ return { id:a, label:addonLabel(a), status:'', amount:null }; });
    var food=adds.some(function(a){ return ['buffet','catering','cocktail'].indexOf(a.id)>=0; }), opts=b?b.options:((D.est&&D.est.options)||[]);
    var total=qt?qt.total:b&&b.amount!=null?b.amount:est?est.total:null, lay=sp.layouts||{}, pk=sp.parking||{}, ph=sp.photos||[];
    var lays=[['standing','스탠딩'],['theater','강연식'],['classroom','강의식'],['banquet','연회식']].filter(function(x){ return lay[x[0]]; }).map(function(x){ return x[1]+' '+lay[x[0]]+'명'; });
    var name=(b&&b.org?b.org+' ':'')+((b&&b.purpose_label)||'행사');
    var budget='<table class="doc-table"><thead><tr><th>구분</th><th>내용</th><th class="r">금액</th></tr></thead><tbody><tr><td>공간 이용료</td><td>'+esc(sp.name)+(qt?' · 호스트 견적':est?' · 요금표 기준 예상':'')+'</td><td class="r">'+(total!=null?esc(won(total)):'견적 예정')+'</td></tr>'
      +adds.map(function(a){ return '<tr><td>'+esc(a.label)+'</td><td>메가스팟 부가서비스'+(a.status?' · '+esc(a.status):'')+'</td><td class="r" data-edit>'+(a.amount?esc(won(a.amount)):'별도 견적')+'</td></tr>'; }).join('')
      +'<tr><td data-edit>기타</td><td data-edit></td><td class="r" data-edit></td></tr></tbody></table>'+(total!=null&&w.people?'<p class="doc-note">공간 이용료 기준 1인당 '+esc(won(Math.round(total/w.people)))+' ('+esc(String(w.people))+'명)'+(est&&est.deposit&&!qt?' · 보증금 '+esc(won(est.deposit))+' 별도':'')+'</p>':'');
    return head('행사기획서'+(b&&b.status==='confirmed'?'':' (안)'), '<span data-edit>'+esc(name)+'</span>', b?b.code:'')
      +sect('1. 행사 개요', kv([['행사명', '<span data-edit>'+esc(name)+'</span>'],['일시', esc(whenText(w))],['장소', esc(sp.name)+' <small>'+esc(sp.address_full||sp.address)+'</small>'],['참석 인원', w.people?esc(String(w.people))+'명':''],['주최·담당', b?esc([b.org, b.name].filter(Boolean).join(' · ')):'<span data-edit>주최와 담당자를 적어 주세요</span>'],['진행 상태', b?esc(b.status_label)+' · 예약번호 '+esc(b.code):'예약 요청 전']]))
      +'<section class="doc-sec doc-avoid"><h2>2. 장소</h2><div class="doc-place">'+(ph[0]?'<img src="'+esc(ph[0].src)+'" alt="'+esc(sp.name)+'">':'')+'<div>'+kv([['면적·인원', esc([sp.area?sp.area+'평':'', sp.capacity?'최대 '+sp.capacity+'명':''].filter(Boolean).join(' · '))],['배치별 인원', esc(lays.join(' · '))],['시설·장비', esc((sp.facility_labels||[]).join(' · '))],['교통·주차', esc([sp.station, pk.count!=null?'주차 '+pk.count+'대':'', pk.note].filter(Boolean).join(' · '))],['운영 시간', esc(sp.hours||'')]])+'</div></div></section>'
      +'<section class="doc-sec doc-avoid"><h2>3. 진행 일정 (안)</h2><table class="doc-table"><thead><tr><th style="width:26%">시간</th><th>내용</th><th style="width:22%">담당·비고</th></tr></thead><tbody>'+timeline(w.start, w.end, food).map(function(r){ return '<tr><td data-edit>'+esc(r[0])+'</td><td data-edit>'+esc(r[1])+'</td><td data-edit></td></tr>'; }).join('')+'</tbody></table></section>'
      +sect('4. 준비 항목', kv([['공간 옵션', esc(opts.map(function(o){ return o.name+' '+o.qty+o.unit; }).join(', ')||'없음')],['메가스팟 부가서비스', esc(adds.map(function(a){ return a.label+(a.status?'('+a.status+')':''); }).join(' · ')||'신청하지 않음')],['요청 사항', b?nl([b.message, b.addon_note].filter(Boolean).join('\n')):'']]))
      +'<section class="doc-sec doc-avoid"><h2>5. 예산</h2>'+budget+'</section>'
      +'<section class="doc-sec doc-avoid"><h2>6. 준비 일정</h2>'+checklist(w.date)+'</section>'
      +sect('7. 유의사항', kv([['이용 규정', nl([(sp.rules||{}).food?'외부 음식 반입 '+({ok:'가능',limited:'일부 가능 (협의)',no:'불가'}[sp.rules.food]||''):'', (sp.rules||{}).alcohol?'주류 '+({ok:'가능',no:'불가'}[sp.rules.alcohol]||''):'', (sp.rules||{}).note].filter(Boolean).join('\n'))],['환불 규정', nl(S.refundText(sp.refund))],['호스트', esc([(sp.seller||{}).company, (sp.contact||{}).phone].filter(Boolean).join(' · '))],['메가스팟', '부가서비스·행사 준비 문의 010-2384-9580']]))
      +foot('진행 일정과 예산은 초안입니다. 화면에서 내용을 눌러 고친 뒤 내려받을 수 있습니다.');
  }
  function planReqDoc(){
    var p=D.planning, pr=p.proposal;
    return head('행사기획서'+(pr?'':' (요청서)'), '<span data-edit>'+esc((p.purpose_label||'행사')+' 준비')+'</span>', p.ref)
      +sect('1. 행사 개요', kv([['행사', esc(p.purpose_label||'')],['희망 일시', esc([p.date?kd(p.date):'', p.date_note].filter(Boolean).join(' · ')||'협의')],['지역', esc(p.region_label||'무관')],['참석 인원', p.people?p.people+'명':''],['1인 예산', p.budget_pp?esc(won(p.budget_pp)):'협의'],['전체 예산', p.budget_total?esc(won(p.budget_total))+' <small>인원 × 1인 예산</small>':''],['신청자', esc(p.name)],['진행 상태', esc(p.status_label)+' · 접수번호 '+esc(p.ref)]]))
      +sect('2. 맡긴 항목', '<ul class="doc-list">'+p.needs.map(function(n){ return '<li>'+esc(n)+'</li>'; }).join('')+'</ul>'+(p.message?'<p class="doc-note">'+nl(p.message)+'</p>':''))
      +(pr?sect('3. 메가스팟 제안', (pr.summary?'<p>'+nl(pr.summary)+'</p>':'')+kv([['제안 금액', pr.amount!=null?esc(won(pr.amount))+(p.people?' <small>1인당 '+esc(won(Math.round(pr.amount/p.people)))+'</small>':''):''],['자세한 자료', pr.link?esc(pr.link):''],['제안일', esc(pr.sent_at||'')]]))
        :sect('3. 메가스팟 제안', '<p>메가스팟 담당자가 조건에 맞는 공간과 구성을 준비하고 있습니다. 제안이 준비되면 이 문서에 함께 표시됩니다.</p>'))
      +'<section class="doc-sec doc-avoid"><h2>4. 진행 일정 (안)</h2><table class="doc-table"><thead><tr><th style="width:26%">시간</th><th>내용</th><th style="width:22%">담당·비고</th></tr></thead><tbody>'+timeline('', '', true).map(function(r){ return '<tr><td data-edit>'+esc(r[0])+'</td><td data-edit>'+esc(r[1])+'</td><td data-edit></td></tr>'; }).join('')+'</tbody></table></section>'
      +'<section class="doc-sec doc-avoid"><h2>5. 준비 일정</h2>'+checklist(p.date)+'</section>'
      +foot('메가스팟 행사 준비 문의 010-2384-9580 · 화면에서 내용을 눌러 고친 뒤 내려받을 수 있습니다.');
  }

  /* ---------- 화면 ---------- */
  function link(t){ var u=new URLSearchParams(location.search); u.set('type', t); return '/docs/?'+u.toString(); }
  function fileName(){ var base=D.planning?D.planning.ref:D.booking?D.booking.code:(D.space?D.space.name:''); return ('메가스팟_'+NAME[type]+'_'+base).replace(/[\\/:*?"<>|\s]+/g,'_')+'.pdf'; }
  function draw(){
    var types=D.planning?['plan']:['quote','space','plan'];
    $('#doc-tabs').innerHTML=types.map(function(t){ return '<a href="'+esc(link(t))+'"'+(t===type?' class="on" aria-current="page"':'')+'>'+NAME[t]+'</a>'; }).join('');
    el.innerHTML=type==='space'?spaceDoc():type==='plan'?planDoc():quoteDoc(); el.className='doc doc-'+type;
    Array.prototype.forEach.call(el.querySelectorAll('[data-edit]'), function(n){ n.setAttribute('contenteditable','true'); n.setAttribute('spellcheck','false'); });
    document.title=NAME[type]+' · '+(D.planning?D.planning.ref:D.space.name)+' | 메가스팟';
    var tip=$('#doc-tip'); tip.hidden=type!=='plan'; tip.textContent='옅은 파란색 칸은 눌러서 바로 고칠 수 있습니다. 고친 내용 그대로 PDF에 담깁니다.';
    $('#doc-loading').hidden=true; $('#doc-paper').hidden=false; $('#doc-pdf').disabled=false; $('#doc-print').disabled=false;
  }
  function images(){ return Promise.all(Array.prototype.map.call(el.querySelectorAll('img'), function(i){ return i.complete?null:new Promise(function(r){ i.onload=i.onerror=r; }); })); }
  $('#doc-print').addEventListener('click', function(){ window.print(); });
  $('#doc-pdf').addEventListener('click', function(){
    var btn=this; if(!window.html2pdf){ M.toast('PDF 도구를 불러오지 못했습니다. 인쇄 버튼에서 ‘PDF로 저장’을 골라 주세요.'); return; }
    btn.disabled=true; btn.textContent='PDF 만드는 중…'; document.body.classList.add('doc-making');
    images().then(function(){ return window.html2pdf().set({ margin:[12,12,13,12], filename:fileName(), image:{ type:'jpeg', quality:0.94 }, html2canvas:{ scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false }, jsPDF:{ unit:'mm', format:'a4', orientation:'portrait' }, pagebreak:{ mode:['css','legacy'], avoid:['tr','.doc-sec','.doc-avoid','.doc-head','.doc-stats','.doc-hero','.doc-foot'] } }).from(el).save(); })
      .catch(function(){ M.toast('PDF를 만들지 못했습니다. 인쇄 버튼에서 ‘PDF로 저장’을 골라 주세요.'); })
      .then(function(){ btn.disabled=false; btn.textContent='PDF 내려받기'; document.body.classList.remove('doc-making'); });
  });
  load().then(draw).catch(function(e){ stop(e&&e.code==='NO_API'?'서버에 연결하지 못했습니다. 잠시 후 다시 열어 주세요.':(e&&e.message)||'문서를 만들지 못했습니다.'); });
})();
