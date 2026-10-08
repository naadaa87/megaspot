/* 견적 문의 페이지 */
(function(){
  var M=window.MEGASPOT, $=M.$;
  var q=new URLSearchParams(location.search);
  var mode=q.get('mode')==='request'?'request':'space';
  var spaceId=q.get('space')|| (mode==='request'?'request':'megaspot-gundae');
  var root=$('#inquiry-root'); if(!root) return;
  var inq=M.renderInquiry(root,{ spaceId:spaceId, mode:mode, prefill:{ purpose:q.get('purpose')||'', people:q.get('people')||'', region:q.get('region')||'', date:q.get('date')||'' } });
  if(mode==='request'){ $('#inq-title').innerHTML='조건에 맞는 공간을<br>찾아 드립니다'; $('#inq-lead').textContent='원하는 날짜·인원·지역에 맞는 공간이 아직 목록에 없다면 행사 조건을 남겨 주세요. 메가스팟이 확인 가능한 공간을 찾아 연락드리고, 같은 형식의 견적으로 비교할 수 있게 정리해 드립니다.'; }
  var grid=$('#inq-grid'); var mq=window.matchMedia('(min-width:960px)'); function lay(e){ grid.style.gridTemplateColumns=e.matches?'1.4fr .7fr':'1fr'; } lay(mq); mq.addEventListener('change',lay);
})();
