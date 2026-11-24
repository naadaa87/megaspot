/* 홈 · 날짜부터 확인하기 (2026-11-25)
   날짜·시작·이용 시간·인원으로 건대 1호·2호가 그 시간에 비었는지(공개 예약 현황)와 예상 금액(요금표 계산)을 함께 보여 줍니다.
   금액은 공간료·인원 추가 기준의 예상치이고, 옵션·식음료·보증금은 예약/견적 문의에서 더합니다. */
(function(){
  var M=window.MEGASPOT, PRICE=window.MEGASPOT_PRICE, R=M&&M.reservations; if(!M||!PRICE) return;
  var $=M.$, esc=M.esc, form=$('#df-form'), out=$('#df-result'); if(!form) return;
  var SP=[['megaspot-gundae','건대 1호','190평 · 최대 200명'],['megaspot-gundae-2','건대 2호','400평 · 최대 350명']];
  var today=new Date(Date.now()+9*36e5).toISOString().slice(0,10);
  var hl=function(h){ return (h>=24?'다음 날 ':'')+('0'+(h%24)).slice(-2)+':00'; };
  $('#df-date').min=today; $('#df-date').value=PRICE.addDays?PRICE.addDays(today,14):today;
  $('#df-start').innerHTML=Array.from({length:22},function(_,i){ var h=i+5; return '<option value="'+h+'"'+(h===13?' selected':'')+'>'+hl(h)+'</option>'; }).join('');
  $('#df-hours').innerHTML=[1,2,3,4,5,6,7,8,10,12,13].map(function(n){ return '<option value="'+n+'"'+(n===4?' selected':'')+'>'+n+'시간</option>'; }).join('');
  function q(o){ return new URLSearchParams(o).toString(); }
  function check(e){
    if(e) e.preventDefault();
    var date=$('#df-date').value, start=+$('#df-start').value, hours=+$('#df-hours').value, people=Math.max(1,parseInt($('#df-people').value,10)||1), end=start+hours;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<today){ out.innerHTML='<p class="small err">이용일을 오늘 이후로 골라 주세요.</p>'; return; }
    out.innerHTML='<p class="small muted">확인하는 중…</p>';
    Promise.all(SP.map(function(s){
      var E=PRICE.forSpace(s[0]), D=E.data&&E.data();
      if(!D) return Promise.resolve({s:s,err:'요금표를 불러오지 못했습니다.'});
      if(end>D.openTo){ return Promise.resolve({s:s,err:'이용 시간이 운영 시간(다음 날 '+('0'+(D.openTo-24)).slice(-2)+':00)을 넘습니다.'}); }
      var over=people>D.people.max, qt=E.quote({date:date,start:start,end:end,people:Math.min(people,D.people.max)});
      var av=R&&R.checkRange?R.checkRange({space:s[0],date:date,start:start,end:end}).catch(function(){ return {unknown:true}; }):Promise.resolve({unknown:true});
      return av.then(function(v){ return {s:s,q:qt,v:v,over:over,max:D.people.max,deposit:D.deposit&&D.deposit.amount}; });
    })).then(function(rows){
      out.innerHTML='<div class="df-rows">'+rows.map(function(r){
        var s=r.s; if(r.err) return '<div class="df-row"><b>'+esc(s[1])+'</b><p class="small">'+esc(r.err)+'</p></div>';
        var v=r.v||{}, state=r.over?['over','인원 초과','최대 '+r.max+'명까지 이용할 수 있어요']:v.closed?['no','신청 불가','이 날짜는 예약을 받지 않습니다']:v.conflict?['no','이미 예약 있음','같은 시간에 확정 예약이 있어요. 다른 시간이나 다른 공간을 확인해 보세요']:v.unknown?['ask','확인 필요','예약 현황을 확인하지 못했어요. 문의 주시면 바로 확인해 드립니다']:['ok','이 시간 비어 있음','확정 예약이 없는 시간입니다. 최종 가능 여부는 신청 후 확인합니다'];
        var link='/inquiry/?'+q({space:s[0],date:date,start:start,end:end,people:people})+'#reserve';
        return '<div class="df-row df-'+state[0]+'"><div class="df-row-h"><b>'+esc(s[1])+'</b><small>'+esc(s[2])+'</small><em>'+esc(state[1])+'</em></div>'
          +(r.q&&!r.over?'<p class="df-price">예상 '+esc(PRICE.won(r.q.total))+(r.q.pkg?' <small>'+esc(r.q.pkg.label)+' 적용</small>':'')+'</p>':'')
          +'<p class="small muted">'+esc(state[2])+(r.deposit?' · 보증금 '+esc(PRICE.man(r.deposit))+' 별도':'')+'</p>'
          +'<div class="df-acts"><a class="btn btn-primary btn-sm" href="'+esc(link)+'">이 조건으로 견적 보기 →</a><a class="btn btn-light btn-sm" href="/visit/?space='+s[0]+'">사전답사 신청</a></div></div>';
      }).join('')+'</div><p class="tiny muted mt-1">'+esc(PRICE.kdate?PRICE.kdate(date):date)+' '+hl(start)+'–'+hl(end)+' · '+people+'명 기준 · 공간료와 인원 추가만 계산한 예상 금액입니다. 옵션·식음료는 견적 화면에서 더할 수 있어요.</p>';
    });
  }
  form.addEventListener('submit',check);
})();
