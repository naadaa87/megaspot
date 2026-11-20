(function(){
  'use strict';
  var X=window.MEGASPOT_ADMIN,M=window.MEGASPOT;
  if(!X||!M)return;
  var $=M.$,esc=X.esc,items=[],review=[],lastLoad=0,saving=false,proof=null,login=null,loginBusy=false,automation={};
  var labels={block:'등록 확인 필요',release:'해제 확인 필요',hold:'기존 차단 확인 필요',linked:'등록 확인됨',covered:'기존 차단 확인됨'};
  var reviewLabels={conflict:'스페이스클라우드의 기존 일정과 겹칩니다.',unknown_result:'저장 결과를 확인해야 합니다.',host_unavailable:'호스트센터 일정 조회를 확인해 주세요.',public_unverified:'고객 화면의 차단 여부를 확인해 주세요.',booking_changed:'메가스팟 예약 시간이 변경됐습니다.'};
  var autoLabels={ready:'자동 연동 연결됨 · 등록과 해제를 순서대로 처리합니다.',login_required:'전용 호스트 로그인이 필요합니다.',paused:'자동 연동 일시 중지 · 호스트센터에서 직접 반영할 수 있습니다.',budget_wait:'브라우저 사용 한도로 자동 처리가 대기 중입니다.',review:'전용 브라우저 상태를 확인해 주세요.',offline:'자동 연동 연결 대기 · 호스트센터에서 직접 반영할 수 있습니다.'};
  function showAutomation(){
    $('#sc-auto-status').textContent=autoLabels[automation.status||'offline'];
    $('#sc-auto-controls').hidden=!automation.login_available;
    $('#sc-auto-login').hidden=!!login;
    ['#sc-auto-view','#sc-auto-save','#sc-auto-cancel'].forEach(function(id){$(id).hidden=!login;});
    ['#sc-auto-login','#sc-auto-save','#sc-auto-cancel'].forEach(function(id){$(id).disabled=loginBusy;});
    if(login)$('#sc-auto-view').href=login.live_view_url;
    else $('#sc-auto-view').removeAttribute('href');
  }
  function loginAction(action){
    if(loginBusy)return;
    loginBusy=true;showAutomation();
    return X.A('/spacecloud-blocks/login/'+action,{method:'POST',body:login?{login_id:login.login_id}:{}})
      .then(function(result){
        login=action==='start'?result:null;
        $('#sc-auto-note').textContent=action==='start'?'새 창에서 호스트로 로그인한 뒤 여기에서 로그인 확인을 눌러 주세요.':action==='save'?'호스트 로그인을 연결했습니다.':'로그인을 취소했습니다.';
        return action==='start'?null:load();
      }).catch(function(e){if(!X.guard(e))$('#sc-auto-note').textContent=e.message;})
      .finally(function(){loginBusy=false;showAutomation();});
  }
  $('#sc-auto-login').addEventListener('click',function(){loginAction('start');});
  $('#sc-auto-save').addEventListener('click',function(){loginAction('save');});
  $('#sc-auto-cancel').addEventListener('click',function(){loginAction('cancel');});
  function clock(hour){return String(hour).padStart(2,'0')+':00';}
  function info(row){return [row.date,clock(row.start)+'–'+clock(row.end),row.space_name,row.product_name].join(' · ');}
  function render(){
    var space=$('#sc-blocks-space').value,filter=$('#sc-blocks-filter').value;
    var visible=items.filter(function(row){return (!space||row.space_id===space)&&(!filter||(filter==='open'?row.action!=='linked'&&row.action!=='covered':row.action==='linked'||row.action==='covered'));});
    var warnings=filter==='linked'?[]:review.filter(function(row){return !space||row.space_id===space;});
    $('#sc-blocks-status').textContent=visible.length+'개 상품 일정'+(warnings.length?' · 이용 시간 확인 '+warnings.length+'건':'');
    var html=warnings.map(function(row){return '<div class="adm-row"><div class="r1"><b>'+esc(row.code)+'</b><span>이용 시간 확인 필요</span></div><div class="r2">'+esc(row.date+' · '+row.space_name)+'</div></div>';});
    visible.forEach(function(row){
      var action=row.action,write=!row.automatic_processing&&(action==='block'||action==='release'),verifying=proof===row.id;
      html.push('<div class="adm-row"><div class="r1"><b>'+esc(row.date+' '+clock(row.start)+'–'+clock(row.end))+'</b><span>'+(row.automatic_processing?'자동 작업 중':labels[action])+'</span></div>'
        +'<div class="r2">'+esc(row.space_name+' · '+row.product_name+' · '+row.code)+'</div>'
        +(row.automation_review?'<p class="small muted">'+esc(reviewLabels[row.automation_review]||'자동 처리 결과를 확인해 주세요.')+'</p>':'')
        +'<div class="r3"><span>외부예약 이름 '+esc(row.marker)+'</span>'
        +'<div class="row" style="gap:6px;flex-wrap:wrap"><a class="btn btn-light btn-sm" href="'+esc(row.host_url)+'" target="_blank" rel="noopener">호스트 캘린더 ↗</a>'
        +'<a class="btn btn-light btn-sm" href="'+esc(row.public_url)+'" target="_blank" rel="noopener">고객 화면 ↗</a>'
        +'<button class="btn btn-light btn-sm" type="button" data-sc-copy="'+esc(row.id)+'">등록 정보 복사</button>'
        +(write?'<button class="btn btn-primary btn-sm" type="button" data-sc-confirm="'+esc(row.id)+'"'+(saving?' disabled':'')+'>'+(action==='block'?'차단 확인 기록':'해제 확인 기록')+'</button>':'')
        +'</div></div>'
        +(verifying?'<div class="form-note"><p>'+(action==='block'?'고객 화면에서 해당 시간의 예약이 막혔는지 확인해 주세요.':'호스트센터에서 이 이름으로 등록한 외부예약을 해제하고 고객 화면도 확인해 주세요.')+'</p>'
          +'<div class="row mt-1" style="gap:6px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" type="button" data-sc-save="'+esc(row.id)+'">'+(action==='block'?'이 이름으로 등록 완료':'해제 완료')+'</button>'
          +(action==='block'?'<button class="btn btn-light btn-sm" type="button" data-sc-cover="'+esc(row.id)+'">기존 차단이 이미 있음</button>':'')
          +'<button class="btn btn-light btn-sm" type="button" id="sc-proof-cancel">닫기</button></div></div>':'')
        +'</div>');
    });
    $('#sc-blocks-list').innerHTML=html.join('')||X.emptyMsg('이 조건에 해당하는 일정이 없습니다.');
  }
  function load(){
    var request=++lastLoad;proof=null;
    $('#sc-blocks-status').textContent='확정 예약을 불러오는 중입니다.';
    return X.A('/spacecloud-blocks').then(function(result){
      if(request!==lastLoad)return;
      items=result.items;review=result.review;automation=result.automation||{};showAutomation();render();
    }).catch(function(e){if(request===lastLoad&&!X.guard(e))$('#sc-blocks-status').textContent=e.message;});
  }
  $('#sc-blocks-reload').addEventListener('click',load);
  ['#sc-blocks-space','#sc-blocks-filter'].forEach(function(id){$(id).addEventListener('change',render);});
  $('#sc-blocks-list').addEventListener('click',function(e){
    if(e.target.closest('#sc-proof-cancel')){proof=null;render();return;}
    var b=e.target.closest('button[data-sc-copy],button[data-sc-confirm],button[data-sc-save],button[data-sc-cover]');
    if(!b||saving)return;
    var row=items.find(function(x){return x.id===(b.dataset.scCopy||b.dataset.scConfirm||b.dataset.scSave||b.dataset.scCover);});
    if(!row)return;
    if(b.dataset.scCopy){
      M.copy(info(row)+'\n외부예약 이름 '+row.marker).then(function(ok){M.toast(ok?'외부예약 등록 정보를 복사했습니다.':'복사하지 못했습니다.');});
      return;
    }
    if(b.dataset.scConfirm){proof=row.id;render();return;}
    if(proof!==row.id)return;
    saving=true;b.disabled=true;
    X.A('/spacecloud-blocks',{method:'POST',body:{id:row.id,action:b.dataset.scCover?'cover':row.action}}).then(load)
      .catch(function(e){if(!X.guard(e))M.toast(e.message);}).finally(function(){saving=false;render();});
  });
  X.register('spacecloud-blocks',load);
  if(X.visible()&&location.hash==='#spacecloud-blocks')X.go('spacecloud-blocks');
})();
