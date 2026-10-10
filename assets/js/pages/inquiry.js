/* 견적 문의 페이지 — ?type=regular|partner, ?mode=request, 예상 금액 계산기에서 넘어온 값(?est=1)을 받습니다 */
(function(){
  var M=window.MEGASPOT, $=M.$;
  var q=new URLSearchParams(location.search);
  var mode=q.get('mode')==='request'?'request':'space';
  var type=['event','regular','partner'].indexOf(q.get('type'))>=0 ? q.get('type') : 'event';
  var spaceId=q.get('space')|| (mode==='request'?'request':'megaspot-gundae');
  var est=''; if(q.get('est')){ try{ est=sessionStorage.getItem('ms_estimate')||''; }catch(_){} }
  var root=$('#inquiry-root'); if(!root) return;
  var inq=M.renderInquiry(root,{ spaceId:spaceId, mode:mode, type:type, prefill:{ purpose:q.get('purpose')||'', people:q.get('people')||'', region:q.get('region')||'', date:q.get('date')||'', slot:q.get('slot')||'', layout:q.get('layout')||'', estimate:est } });
  var HEAD={
    event:['행사 조건으로<br>견적 문의','행사 목적·날짜·인원·배치·필수 조건을 한 번에 남겨 주세요. 같은 내용을 여러 곳에 반복 설명하지 않도록 문의서를 중심으로 조건을 확인하고 견적을 안내합니다.'],
    request:['조건에 맞는 공간을<br>찾아 드립니다','원하는 날짜·인원·지역에 맞는 공간이 아직 목록에 없다면 행사 조건을 남겨 주세요. 메가스팟이 확인 가능한 공간을 찾아 연락드리고, 같은 형식의 견적으로 비교할 수 있게 정리해 드립니다.'],
    regular:['정기·반복 모임<br>상담 신청','매주·격주·매월 여는 모임이라면 반복 주기와 기간을 알려 주세요. 월 2회 이상, 3개월 이상이면 정기 대관 할인을 적용하고, 이 기준에 맞지 않는 일정도 따로 협의합니다.'],
    partner:['제휴·협력·파트너<br>제안','행사 기획·대행사, 케이터링·장비·인력 협력사, 브랜드 제휴, 학교·기관·커뮤니티 협력처럼 함께 일할 방법이 있다면 알려 주세요. 요금표와 별도로 조건을 협의합니다.']
  };
  function head(t){ var h=HEAD[t==='event'&&mode==='request'?'request':t]||HEAD.event; $('#inq-title').innerHTML=h[0]; $('#inq-lead').textContent=h[1]; }
  head(type);
  var box=root.querySelector('#iq-types'); if(box) box.addEventListener('click', function(e){ var b=e.target.closest('.iq-type'); if(b) head(b.dataset.v); });
  if(est){ try{ sessionStorage.removeItem('ms_estimate'); }catch(_){} }
  var grid=$('#inq-grid'); var mq=window.matchMedia('(min-width:960px)'); function lay(e){ grid.style.gridTemplateColumns=e.matches?'1.4fr .7fr':'1fr'; } lay(mq); mq.addEventListener('change',lay);
})();
