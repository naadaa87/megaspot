/* 메가스팟 예약확정서 — A4 문서를 캔버스에 그려 이미지(PNG)·PDF로 저장하거나 공유합니다.
   관리자 화면(예약확정서 발급)과 고객 화면(/confirm/)이 같은 그림을 씁니다. 외부 라이브러리 없이 동작합니다.
   doc 값은 functions/api/_confirm.js 의 publicDoc() 과 같은 모양입니다. */
(function(){
  var W = 794, H = 1123, S = 2;   // A4(96dpi 기준) × 2배 = 1588×2246px
  var C = { ink: '#1E2225', ink2: '#5B6168', ink3: '#7A8086', line: '#E3E0DA', line2: '#EFECE7', cobalt: '#1F53D5', soft: '#E6ECFB', gray: '#F6F5F2', rust: '#B35632', graphite: '#262B2E' };
  var FF = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
  var LOGO = 'Anton, "Arial Black", Impact, sans-serif';
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var PAY = { cancellation_receivable:'예약 취소 · 추가 수납 대기', cancellation_refund:'예약 취소 · 환불 처리 대기', cancellation_settled:'예약 취소 · 정산 완료', paid: '결제 완료', deposit: '예약금 입금 완료 · 잔금은 이용 전 안내', onsite: '현장 결제', pending: '결제 방법 안내 예정', refund:'초과 수납 · 환불 필요', payment_review:'수납·환불 기록 확인 필요', refunded:'예약 취소 · 전액 환불 완료' };
  var SLOT = { 'pkg-day': [10, 17], 'pkg-allday': [10, 24], 'pkg-allnight': [18, 31] };
  var GUIDE = [
    '예약한 시간 안에 입장·세팅·정리·퇴장을 모두 마쳐 주세요. 시간을 늘려야 하면 미리 연락 주세요.',
    '건물 1층·4층 주차(최대 140대). 주차권은 1시간 4,000원, 일일권 30,000원(이용일 당일 23:59까지). 익일까지 주차하려면 다음 날 시간권 또는 일일권을 별도로 구매해 주세요. 주차 안내: https://megaspot.kr/parking/',
    '외부 음식·음료·주류를 가져오실 수 있습니다. 음향은 미리 정한 음량 기준을 지켜 주세요.',
    '이용 뒤 기본 정리, 파손·오염, 부착물 제거를 확인하고 보증금을 돌려 드립니다.'
  ];
  function cfg(){ var M = window.MEGASPOT || {}; var c = M.CONFIG || {}; return { phone: c.phone || '010-2384-9580', email: c.email || 'spaceblank0100@gmail.com', kakao: String(c.kakaoChannel || 'https://pf.kakao.com/_LnxbmX/chat').replace(/^https?:\/\//, '').replace(/\/chat$/, '') }; }
  function won(n){ return (Math.round(n) || 0).toLocaleString('ko-KR') + '원'; }
  function pad(n){ return ('0' + n).slice(-2); }
  function hl(h){ h = +h; return (h >= 24 ? '다음 날 ' : '') + pad(h % 24) + ':00'; }
  function dateText(iso){ if (!iso) return ''; var p = String(iso).split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2]); return p[0] + '년 ' + (+p[1]) + '월 ' + (+p[2]) + '일 (' + DOW[d.getDay()] + ')'; }
  function hours(doc){
    var s = doc.start_h, e = doc.end_h;
    if ((s == null || e == null) && SLOT[doc.slot]) { s = SLOT[doc.slot][0]; e = SLOT[doc.slot][1]; }
    return s != null && e != null && +e > +s ? [+s, +e] : null;
  }
  function timeText(doc){ var h = hours(doc); return h ? hl(h[0]) + ' – ' + hl(h[1]) + ' (' + (h[1] - h[0]) + '시간)' : '시간은 별도 안내'; }
  function issuedText(doc){ var t = doc.issued_at ? String(doc.issued_at).slice(0, 10) : ''; if (!t) { var n = new Date(Date.now() + 9 * 3600e3); t = n.toISOString().slice(0, 10); } var p = t.split('-'); return p[0] + '. ' + (+p[1]) + '. ' + (+p[2]) + '.'; }
  function fileName(doc, ext){ return (doc.doc_type==='cancellation'?'메가스팟_취소환불정산서_':'메가스팟_예약확정서_') + (doc.code || '미발급') + '.' + ext; }

  function receptionRows(doc){
    var r=doc.reception;if(!r)return [];
    var included=r.included?'확정 금액에 포함':'확정 금액과 별도 · 합계 미포함';
    var rows=[[r.price_basis==='budget'?'1인 예산 · 인원':'참고 코스 · 식사 인원',(r.courseName||'코스 미정')+' · '+(r.people?r.people+'명':'인원 상담')],['제공 방식',r.formatName||'상담 후 결정']];
    if(r.menuNames&&r.menuNames.length)rows.push(['희망 메뉴',r.menuNames.join(', ')]);
    if(r.price_basis==='budget')rows.push(['금액 기준','선택 예산에 따른 예상 금액 · 메뉴·제공량 상담 후 확정']);
    if(r.request_note)rows.push(['고객 요청',r.request_note]);
    if(r.status==='cancelled'){rows.push(['진행 상태','취소 · 합계 제외']);return rows;}
    if(doc.show_amount!==false){
      rows.push(['케이터링 금액',(r.total==null?'상담 후 견적':won(r.total))+' · '+included+(r.vat_excluded===true?' · 부가세 포함':' · 이전 저장 금액 · 부가세 조건 확인 필요')]);
      if(r.food!=null&&r.fee!=null)rows.push(['산출 내역','메뉴 '+won(r.food)+(r.unitPrice!=null?' (1인 '+won(r.unitPrice)+' × '+r.people+'명)':'')+' + '+(r.feeName||'출장·세팅비')+' '+won(r.fee)]);
      if(r.vat_excluded===true&&r.supply!=null&&r.vat!=null)rows.push(['공급가액 · 부가세',won(r.supply)+' (부가세 별도) + 부가세 10% '+won(r.vat)]);
    }else rows.push(['확정 범위',included]);
    if(r.note)rows.push(['케이터링 안내',r.note]);
    return rows;
  }

  /* ---------- 글꼴·이미지 준비 ---------- */
  var ready = null, qr = null;
  function prepare(){
    if (ready) return ready;
    var fonts = document.fonts && document.fonts.load ? Promise.all(['400 16px "Pretendard Variable"', '600 16px "Pretendard Variable"', '800 16px "Pretendard Variable"', '400 30px Anton'].map(function(f){ return document.fonts.load(f).catch(function(){}); })) : Promise.resolve();
    var img = new Promise(function(res){ var i = new Image(); i.onload = function(){ qr = i; res(); }; i.onerror = function(){ res(); }; i.src = '/assets/img/brand/kakao-qr.svg'; });
    ready = Promise.race([Promise.all([fonts, img]), new Promise(function(r){ setTimeout(r, 2500); })]);
    return ready;
  }

  /* ---------- 그리기 ---------- */
  function draw(canvas, doc, k, paginate){
    var pages=[],ctx;
    function page(){var cv=document.createElement('canvas');cv.width=W*S;cv.height=H*S;pages.push(cv);ctx=cv.getContext('2d');ctx.setTransform(S,0,0,S,0,0);ctx.fillStyle='#FFFFFF';ctx.fillRect(0,0,W,H);ctx.textBaseline='top';}
    page();
    var L = 56, R = W - 56, IW = R - L;
    function font(w, sz, fam){ ctx.font = w + ' ' + sz + 'px ' + (fam || FF); }
    function sp(px){ try { ctx.letterSpacing = px + 'px'; } catch (e) {} }
    function text(s, x, y, o){ o = o || {}; font(o.w || 400, o.sz || 14, o.fam); ctx.fillStyle = o.c || C.ink; ctx.textAlign = o.align || 'left'; sp(o.ls || 0); ctx.fillText(String(s), x, y); sp(0); ctx.textAlign = 'left'; }
    function width(s, w, sz, fam){ font(w, sz, fam); return ctx.measureText(String(s)).width; }
    function wrap(s, maxW, w, sz){
      font(w, sz); var out = [];
      String(s || '').split('\n').forEach(function(par){
        var toks = par.split(/(\s+)/), line = '';
        toks.forEach(function(t){
          if (!t) return;
          if (ctx.measureText(line + t).width <= maxW) { line += t; return; }
          if (line.trim()) { out.push(line.replace(/\s+$/, '')); line = ''; }
          if (/^\s+$/.test(t)) return;
          while (ctx.measureText(t).width > maxW) { var i = t.length; while (i > 1 && ctx.measureText(t.slice(0, i)).width > maxW) i--; out.push(t.slice(0, i)); t = t.slice(i); }
          line = t;
        });
        if (line.trim() || !out.length) out.push(line.replace(/\s+$/, ''));
      });
      return out;
    }
    function hr(y, color, wd){ ctx.fillStyle = color || C.line; ctx.fillRect(L, y, IW, wd || 1); }
    function round(x, y, w, h, r, fill, stroke){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); } }

    function header(){
    // 머리말
    var lw = width('MEGA', 400, 34, LOGO);
    text('MEGA', L, 50, { sz: 34, fam: LOGO, c: C.graphite }); text('SPOT', L + lw, 50, { sz: 34, fam: LOGO, c: C.cobalt });
    text((doc.space && doc.space.name) || '메가스팟 건대 1호', L + 1, 96, { sz: 11, w: 700, c: C.ink3, ls: 4 });
    text(doc.doc_type==='cancellation'?'취소·환불 정산서':'예약 확정서', R, 50, { sz: doc.doc_type==='cancellation'?26:32, w: 800, align: 'right' });
    text(doc.doc_type==='cancellation'?'CANCELLATION SETTLEMENT':'RESERVATION CONFIRMATION', R, 94, { sz: 10, w: 700, c: C.ink3, align: 'right', ls: 2 });
    hr(124, C.graphite, 2);
    // 예약번호 · 발급일 · 상태
    text('예약번호', L, 144, { sz: 11, w: 700, c: C.ink3 });
    text(doc.code || '(저장 전)', L, 162, { sz: 25, w: 800, c: C.cobalt });
    text('발급일', L + 300, 144, { sz: 11, w: 700, c: C.ink3 });
    text(issuedText(doc), L + 300, 166, { sz: 17, w: 700 });
    var st = { confirmed: ['예약 확정', C.cobalt], completed: ['이용 완료', C.graphite], cancelled: ['취소된 예약', C.rust] }[doc.status] || ['예약 확정', C.cobalt];
    var bw = width(st[0], 800, 15) + 40; round(R - bw, 152, bw, 36, 18, st[1]); text(st[0], R - bw / 2, 161, { sz: 15, w: 800, c: '#FFFFFF', align: 'center' });
    hr(208, C.line);

    }
    header();
    var y = 228, LBL = 104, VX = L + LBL, VW = IW - LBL;
    var fs = Math.round(15 * k), lh = Math.round(23 * k), gap = Math.round(22 * k);
    function ensure(need){if(paginate&&y+need>H-190){page();header();y=228;return true;}return false;}
    function section(t){ ensure(Math.round(120*k));text(t, L, y, { sz: Math.round(13.5 * k), w: 800, c: C.cobalt }); y += Math.round(24 * k); }
    function row(label, value, o){
      o = o || {}; var lines = wrap(value, VW, o.w || 500, o.sz || fs);
      var labelLines=wrap(label,LBL-10,600,Math.round(12.5*k)),labelHeight=labelLines.length*Math.round(18*k);
      var subLines=o.sub?wrap(o.sub,VW,400,Math.round(12.5*k)):[];ensure(Math.max(Math.max(1,lines.length)*lh,labelHeight)+subLines.length*Math.round(19*k)+Math.round(11*k));
      labelLines.forEach(function(label,i){text(label,L,y+2+i*Math.round(18*k),{sz:Math.round(12.5*k),w:600,c:C.ink3});});
      lines.forEach(function(ln, i){ text(ln, VX, y + i * lh, { sz: o.sz || fs, w: o.w || 500, c: o.c || C.ink }); });
      y += Math.max(Math.max(1, lines.length) * lh,labelHeight);
      if (o.sub) { wrap(o.sub, VW, 400, Math.round(12.5 * k)).forEach(function(ln){ text(ln, VX, y, { sz: Math.round(12.5 * k), c: C.ink2 }); y += Math.round(19 * k); }); }
      y += Math.round(7 * k); ctx.fillStyle = C.line2; ctx.fillRect(L, y - Math.round(4 * k), IW, 1); y += Math.round(4 * k);
    }
    function bullets(list, sz, color, cols){
      sz = sz || Math.round(13.5 * k); var bl = Math.round(sz * 1.55);
      if (cols === 2) {
        var half=(IW-24)/2, split=Math.ceil(list.length/2), heights=[0,0];list.forEach(function(it,i){heights[i<split?0:1]+=wrap(it,half-14,400,sz).length*bl+Math.round(3*k);});var need=Math.max.apply(null,heights);if(need>H-190-228){bullets(list,sz,color,1);return;}ensure(need);
        var cw = (IW - 24) / 2, rows = Math.ceil(list.length / 2), y0 = y, maxY = y, colY = [y0, y0];
        list.forEach(function(it, i){ var c = i < rows ? 0 : 1, cx = L + c * (cw + 24); var lines = wrap(it, cw - 14, 400, sz); ctx.fillStyle = C.cobalt; ctx.fillRect(cx, colY[c] + sz * 0.55, 4, 4); lines.forEach(function(ln, j){ text(ln, cx + 14, colY[c] + j * bl, { sz: sz, c: color || C.ink }); }); colY[c] += lines.length * bl + Math.round(3 * k); maxY = Math.max(maxY, colY[c]); });
        y = maxY; return;
      }
      list.forEach(function(it){ var lines = wrap(it, IW - 14, 400, sz);ensure(lines.length*bl+Math.round(3*k)); ctx.fillStyle = C.cobalt; ctx.fillRect(L, y + sz * 0.55, 4, 4); lines.forEach(function(ln, j){ text(ln, L + 14, y + j * bl, { sz: sz, c: color || C.ink }); }); y += lines.length * bl + Math.round(3 * k); });
    }

    section('예약자');
    row('이름 · 소속', doc.customer || '-', { w: 700 });
    if (doc.phone) row('연락처', doc.phone);
    y += gap - Math.round(8 * k);

    section(doc.doc_type==='cancellation'?'취소된 예약 정보':'이용 정보');
    var sp0 = doc.space || {};
    row('공간', sp0.name || '메가스팟 건대 1호', { w: 700, sub: sp0.sub || '' });
    if (sp0.address) row('주소', sp0.address);
    row('이용일', dateText(doc.date), { w: 700 });
    row('이용 시간', timeText(doc), { w: 700, sub: doc.time_note || '입장·세팅·정리·퇴장을 모두 포함한 시간입니다.' });
    if (doc.headcount) row('인원', doc.headcount + '명');
    if (doc.event) row('행사', doc.event);
    y += gap - Math.round(8 * k);

    if (doc.show_amount && (doc.amount != null || doc.deposit != null)) {
      section(doc.doc_type==='cancellation'?'취소·환불 정산':'금액 · 결제');
      if (doc.doc_type!=='cancellation'&&doc.amount != null) row('확정 금액', won(doc.amount) + (doc.amount_note ? '  (' + doc.amount_note + ')' : ''), { w: 800, c: C.cobalt, sz: Math.round(16 * k) });
      if(doc.doc_type!=='cancellation')row('결제', (PAY[doc.pay_status] || PAY.paid) + (doc.paid != null && doc.paid > 0 ? ' · 받은 금액 ' + won(doc.paid) : ''));
      settlementRows(doc).forEach(function(r){row(r[0]==='초과 수납 환불 필요액'?'환불 필요액':r[0],r[1]);});
      if (doc.deposit != null) row('보증금', doc.deposit > 0 ? won(doc.deposit) + ' · 이용료와 별도, 이용 뒤 확인하고 돌려 드립니다' : '없음');
      y += gap - Math.round(8 * k);
    }
    var recRows=receptionRows(doc);if(recRows.length){section('선택한 케이터링');recRows.forEach(function(r){row(r[0],r[1]);});y+=gap-Math.round(8*k);}
    (doc.food_services||[]).forEach(function(value){section(value.kind==='catering'?'출장뷔페':'출장 칵테일');window.MEGASPOT_FOOD_SERVICES.rows(value,doc.show_amount).forEach(function(r){row(r[0],r[1]);});y+=gap-Math.round(8*k);});
    if (doc.items && doc.items.length) {var cols=doc.items.length>3?2:1,isz=Math.round(13.5*k),ih=[0,0],split=Math.ceil(doc.items.length/2);doc.items.forEach(function(it,i){ih[cols===2&&i>=split?1:0]+=wrap(it,(cols===2?(IW-24)/2:IW)-14,400,isz).length*Math.round(isz*1.55)+Math.round(3*k);});ensure(Math.min(H-190-228,Math.max.apply(null,ih)+Math.round(24*k)));section('포함 내역'); bullets(doc.items, null, null, cols); y += gap - Math.round(4 * k); }
    if (doc.refund && doc.refund.length) {
      section('취소 · 환불 기준');
      var cx = L, rh = Math.round(30 * k), rs = Math.round(12.5 * k);
      doc.refund.forEach(function(r){
        var t1 = r.k, t2 = Math.round(r.rate * 100) + '%', w1 = width(t1, 500, rs), w2 = width(t2, 800, rs), bw2 = w1 + w2 + 30;
        if (cx + bw2 > R) { cx = L; y += rh + 6; }
        if(ensure(rh+10))cx=L;
        round(cx, y, bw2, rh, 6, C.gray); text(t1, cx + 12, y + (rh - rs) / 2 - 1, { sz: rs, w: 500, c: C.ink2 }); text(t2, cx + 18 + w1, y + (rh - rs) / 2 - 1, { sz: rs, w: 800, c: r.rate > 0 ? C.ink : C.rust });
        cx += bw2 + 8;
      });
      y += rh + Math.round(6 * k);
      ensure(Math.round(18*k)+gap);text('환불 비율은 결제한 이용료 기준이며, 보증금은 별도로 돌려 드립니다.', L, y, { sz: Math.round(11.5 * k), c: C.ink3 }); y += Math.round(18 * k) + gap - Math.round(6 * k);
    }
    if(doc.doc_type!=='cancellation'){section('이용 안내'); bullets(GUIDE, Math.round(12.5 * k), C.ink2);}
    if (doc.note) { y += Math.round(8 * k); section('안내 메모'); wrap(doc.note, IW, 500, Math.round(13.5 * k)).forEach(function(ln){ensure(Math.round(21*k)); text(ln, L, y, { sz: Math.round(13.5 * k), w: 500 }); y += Math.round(21 * k); }); }
    var contentEnd = y;

    pages.forEach(function(cv,index){ctx=cv.getContext('2d');
    // 맺음 — 문의와 사업자 정보 (항상 맨 아래)
    var c = cfg(), by = H - 176, bh = 100;
    round(L, by, IW, bh, 10, C.gray);
    text('문의', L + 22, by + 18, { sz: 12, w: 800, c: C.cobalt, ls: 1 });
    text('전화  ' + c.phone + '     카카오톡  ' + c.kakao, L + 22, by + 40, { sz: 13.5, w: 600 });
    text('이메일  ' + c.email, L + 22, by + 62, { sz: 13.5, w: 600 });
    if (qr) { ctx.drawImage(qr, R - 22 - 72, by + 14, 72, 72); text('휴대폰 카메라로 비추면', R - 22 - 72 - 12, by + 38, { sz: 10.5, w: 600, c: C.ink3, align: 'right' }); text('카카오톡 채팅이 열립니다', R - 22 - 72 - 12, by + 54, { sz: 10.5, w: 600, c: C.ink3, align: 'right' }); }
    text((doc.doc_type==='cancellation'?'취소 정산서':'확정서')+' 다시 보기: megaspot.kr/confirm  (예약번호 + 휴대폰 뒷 4자리)', L, H - 64, { sz: 11, w: 600, c: C.ink2 });
    text(doc.doc_type==='cancellation'?'취소 수수료·환불 정산 안내입니다. 공간 이용을 확정하지 않으며, 세금계산서·현금영수증 등 결제 증빙은 별도입니다.':'이 확정서는 ' + ((doc.space && doc.space.name) || '메가스팟 건대 1호') + ' 예약이 확정되었음을 알려 드리는 문서이며, 세금계산서·현금영수증 등 결제 증빙은 따로 발급됩니다.', L, H - 46, { sz: 10, c: C.ink3 });
    text('주식회사 블랭크 · 대표 최시준 · 사업자등록번호 161-86-03494 · megaspot.kr', L, H - 30, { sz: 10, c: C.ink3 });
    text((index+1)+' / '+pages.length,R,H-64,{sz:11,c:C.ink3,align:'right'});
    });
    canvas.width=W*S;canvas.height=H*S*pages.length;var output=canvas.getContext('2d');pages.forEach(function(cv,index){output.drawImage(cv,0,index*H*S);});canvas.dataset.pages=String(pages.length);
    return contentEnd <= H - 190;
  }
  function render(doc, canvas){
    canvas = canvas || document.createElement('canvas');
    canvas.width = W * S; canvas.height = H * S;
    return prepare().then(function(){
      var ks = [1, 0.93, 0.86, 0.8, 0.74];
      var fits=false;for (var i = 0; i < ks.length; i++) { if (draw(canvas, doc, ks[i],false)){fits=true;break;} }
      if(!fits)draw(canvas,doc,1,true);
      return canvas;
    });
  }

  /* ---------- 내보내기 ---------- */
  function blob(canvas, type, q){ return new Promise(function(res, rej){ canvas.toBlob(function(b){ b ? res(b) : rej(new Error('이미지를 만들지 못했습니다.')); }, type, q); }); }
  function pngBlob(canvas){ return blob(canvas, 'image/png'); }
  function utf16hex(s){ var h = 'FEFF'; for (var i = 0; i < s.length; i++) h += ('000' + s.charCodeAt(i).toString(16)).slice(-4).toUpperCase(); return h; }
  // Export the same page boundaries as the preview, without cropping text.
  function pdfBlob(canvas,title){
    var count=Math.ceil(canvas.height/(H*S)),pages=[];
    for(var i=0;i<count;i++){var cv=document.createElement('canvas');cv.width=canvas.width;cv.height=H*S;cv.getContext('2d').drawImage(canvas,0,i*H*S,canvas.width,H*S,0,0,canvas.width,H*S);pages.push(blob(cv,'image/jpeg',0.92).then(function(b){return b.arrayBuffer();}));}
    return Promise.all(pages).then(function(buffers){
      var te=new TextEncoder(),parts=[],len=0,off=[],PW=595.28,PH=841.89;
      function push(x){var b=typeof x==='string'?te.encode(x):x;parts.push(b);len+=b.length;}
      function obj(n,body){off[n]=len;push(n+' 0 obj\n'+body+'\nendobj\n');}
      push('%PDF-1.4\n');push(new Uint8Array([0x25,0xE2,0xE3,0xCF,0xD3,0x0A]));obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
      obj(2,'<< /Type /Pages /Kids ['+buffers.map(function(_,i){return (3+i*3)+' 0 R';}).join(' ')+'] /Count '+count+' >>');
      buffers.forEach(function(buf,i){var n=3+i*3,jpg=new Uint8Array(buf);obj(n,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /XObject << /Im0 '+(n+1)+' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents '+(n+2)+' 0 R >>');
        off[n+1]=len;push((n+1)+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+canvas.width+' /Height '+H*S+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n');push(jpg);push('\nendstream\nendobj\n');var cs='q '+PW+' 0 0 '+PH+' 0 0 cm /Im0 Do Q';obj(n+2,'<< /Length '+cs.length+' >>\nstream\n'+cs+'\nendstream');
      });
      var info=3+count*3,ts=new Date().toISOString().replace(/[-:T]/g,'').slice(0,14);obj(info,'<< /Title <'+utf16hex(title||'메가스팟 예약확정서')+'> /Producer (MEGASPOT) /CreationDate (D:'+ts+'Z) >>');var xref=len,x='xref\n0 '+(info+1)+'\n0000000000 65535 f \n';for(var j=1;j<=info;j++)x+=('000000000'+off[j]).slice(-10)+' 00000 n \n';push(x+'trailer\n<< /Size '+(info+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');return new Blob(parts,{type:'application/pdf'});
    });
  }
  function download(b, name){
    var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function settlementRows(doc){return window.MEGASPOT_SETTLEMENT?window.MEGASPOT_SETTLEMENT.documentRows(doc):[];}
  function kakaoText(doc, link){
    if(doc.doc_type==='cancellation'){var c=['[예약 취소·환불 정산 안내]','예약번호: '+doc.code,'예약이 취소되었습니다.'];settlementRows(doc).forEach(function(r){c.push('· '+r[0]+': '+r[1]);});if(link)c.push('취소 정산서 조회: '+link);return c.join('\n');}
    var L = ['[' + ((doc.space && doc.space.name) || '메가스팟 건대 1호') + ' 예약 확정 안내]'];
    var nm = String(doc.customer || '').replace(/\s*\(.*\)\s*$/, '');
    L.push((nm ? nm + ' 님, ' : '') + '예약이 확정되었습니다.');
    L.push('');
    L.push('· 예약번호: ' + doc.code);
    L.push('· 이용일: ' + dateText(doc.date));
    L.push('· 이용 시간: ' + timeText(doc));
    if (doc.headcount) L.push('· 인원: ' + doc.headcount + '명');
    if(window.MEGASPOT_FOOD_SERVICES)window.MEGASPOT_FOOD_SERVICES.documentRows(doc).forEach(function(r){L.push('· '+r[0]+': '+r[1]);});
    settlementRows(doc).forEach(function(row){L.push('· '+row[0]+': '+row[1]);});
    receptionRows(doc).forEach(function(row){L.push('· '+row[0]+': '+row[1]);});
    if (link) { L.push(''); L.push('예약확정서는 아래 주소에서 보시고 PDF·이미지로 저장하실 수 있습니다.'); L.push(link); }
    L.push(''); L.push('이용 전에 주차·입장 안내를 따로 보내 드리겠습니다. 감사합니다.');
    return L.join('\n');
  }
  // 휴대폰에서는 카카오톡 등으로 파일을 바로 공유하고, 파일 공유가 안 되는 브라우저는 링크를 공유합니다
  function share(canvas, doc, link){
    return pngBlob(canvas).then(function(b){
      var file = null; try { file = new File([b], fileName(doc, 'png'), { type: 'image/png' }); } catch (e) {}
      var data = { title: doc.doc_type==='cancellation'?'메가스팟 취소·환불 정산서':'메가스팟 예약확정서', text: kakaoText(doc, link) };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: data.title, text: data.text }).then(function(){ return 'shared'; }, function(e){ return e && e.name === 'AbortError' ? 'cancel' : 'error'; });
      }
      if (navigator.share && link) return navigator.share({ title: data.title, text: data.text, url: link }).then(function(){ return 'shared-link'; }, function(e){ return e && e.name === 'AbortError' ? 'cancel' : 'error'; });
      return 'unsupported';
    });
  }
  window.MEGASPOT_CONFIRM = { render: render, settlementRows:settlementRows, receptionRows:receptionRows, pngBlob: pngBlob, pdfBlob: pdfBlob, download: download, share: share, kakaoText: kakaoText, fileName: fileName, dateText: dateText, timeText: timeText, PAY: PAY, size: { w: W * S, h: H * S } };
})();
