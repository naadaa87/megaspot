(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT;
  if(!X||!M)return;
  var $=M.$,esc=X.esc,items=[],review=[],lastLoad=0,saving=false;
  var labels={block:'등록 확인 필요',release:'해제 확인 필요',hold:'기존 차단 확인 필요',linked:'등록 확인됨'};
  function clock(hour){return String(hour).padStart(2,'0')+':00';}
  function info(row){return [row.date,clock(row.start)+'–'+clock(row.end),row.space_name,row.product_name].join(' · ');}
  function render(){
    var space=$('#sc-blocks-space').value,filter=$('#sc-blocks-filter').value;
    var visible=items.filter(function(row){return (!space||row.space_id===space)&&(!filter||(filter==='open'?row.action!=='linked':row.action===filter));});
    var warnings=filter==='linked'?[]:review.filter(function(row){return !space||row.space_id===space;});
    $('#sc-blocks-status').textContent=visible.length+'개 상품 일정'+(warnings.length?' · 이용 시간 확인 '+warnings.length+'건':'');
    var html=warnings.map(function(row){return '<div class="adm-row"><div class="r1"><b>'+esc(row.code)+'</b><span>이용 시간 확인 필요</span></div><div class="r2">'+esc(row.date+' · '+row.space_name)+'</div></div>';});
    visible.forEach(function(row){
      var action=row.action,write=action==='block'||action==='release';
      html.push('<div class="adm-row"><div class="r1"><b>'+esc(row.date+' '+clock(row.start)+'–'+clock(row.end))+'</b><span>'+labels[action]+'</span></div>'
        +'<div class="r2">'+esc(row.space_name+' · '+row.product_name+' · '+row.code)+'</div>'
        +'<div class="r3"><span>외부예약 이름 '+esc(row.marker)+'</span>'
        +'<div class="row" style="gap:6px;flex-wrap:wrap"><a class="btn btn-light btn-sm" href="'+esc(row.host_url)+'" target="_blank" rel="noopener">호스트 캘린더 ↗</a>'
        +'<a class="btn btn-light btn-sm" href="'+esc(row.public_url)+'" target="_blank" rel="noopener">고객 화면 ↗</a>'
        +'<button class="btn btn-light btn-sm" type="button" data-sc-copy="'+esc(row.id)+'">등록 정보 복사</button>'
        +(write?'<button class="btn btn-primary btn-sm" type="button" data-sc-confirm="'+esc(row.id)+'"'+(saving?' disabled':'')+'>'+(action==='block'?'차단 확인 기록':'해제 확인 기록')+'</button>':'')
        +'</div></div></div>');
    });
    $('#sc-blocks-list').innerHTML=html.join('')||X.emptyMsg('이 조건에 해당하는 일정이 없습니다.');
  }
  function load(){
    var request=++lastLoad;
    $('#sc-blocks-status').textContent='확정 예약을 불러오는 중입니다.';
    return X.A('/spacecloud-blocks').then(function(result){
      if(request!==lastLoad)return;
      items=result.items;review=result.review;render();
    }).catch(function(e){if(request===lastLoad&&!X.guard(e))$('#sc-blocks-status').textContent=e.message;});
  }
  $('#sc-blocks-reload').addEventListener('click',load);
  ['#sc-blocks-space','#sc-blocks-filter'].forEach(function(id){$(id).addEventListener('change',render);});
  $('#sc-blocks-list').addEventListener('click',function(e){
    var b=e.target.closest('button[data-sc-copy],button[data-sc-confirm]');
    if(!b)return;
    var row=items.find(function(x){return x.id===(b.dataset.scCopy||b.dataset.scConfirm);});
    if(!row)return;
    if(b.dataset.scCopy){
      M.copy(info(row)+'\n외부예약 이름 '+row.marker).then(function(ok){M.toast(ok?'외부예약 등록 정보를 복사했습니다.':'복사하지 못했습니다.');});
      return;
    }
    if(saving||!confirm(info(row)+'\n'+(row.action==='block'?'호스트센터 외부예약을 등록하고 고객 화면에서 해당 시간이 막혔는지 확인했나요?':'이 이름의 외부예약을 해제하고 고객 화면에서 해당 시간을 확인했나요?')))return;
    saving=true;b.disabled=true;
    X.A('/spacecloud-blocks',{method:'POST',body:{id:row.id,action:row.action}}).then(load)
      .catch(function(e){if(!X.guard(e))M.toast(e.message);}).finally(function(){saving=false;render();});
  });
  X.register('spacecloud-blocks',load);
  if(X.visible()&&location.hash==='#spacecloud-blocks')X.go('spacecloud-blocks');
})();
