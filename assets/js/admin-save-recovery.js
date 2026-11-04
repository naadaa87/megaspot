/* Preserve an uncertain financial write across reloads; retry the exact request, never a replacement. */
(function(root,factory){
 var lib=factory();if(typeof module==='object'&&module.exports){module.exports=lib;return;}
 var X=root.MEGASPOT_ADMIN;if(!X)return;
 var box=document.createElement('aside');box.id='admin-save-recovery';box.className='admin-save-recovery';box.hidden=true;box.setAttribute('role','status');
 box.innerHTML='<p id="admin-save-recovery-text"></p><button id="admin-save-retry" class="btn btn-primary btn-sm" type="button">저장 결과 확인·다시 시도</button><button id="admin-save-dismiss" class="btn btn-light btn-sm" type="button" hidden>닫기</button>';
 document.querySelector('.adm-main').prepend(box);var notice='',store;try{store=root.sessionStorage;}catch{}
 function render(){var item=journal.current();box.hidden=!document.body.classList.contains('adm-on')||(!item&&!notice);box.querySelector('p').textContent=notice||(item?'예약 '+item.code+' · '+(item.kind==='cancellation'?'취소 수수료':item.body.action?'수납·환불 기록 정정·취소':item.body.kind==='refund'?'환불':'수납')+' '+Number(item.body.fee??item.body.amount).toLocaleString('ko-KR')+'원 저장 결과를 확인해야 합니다. 같은 요청으로 확인하므로 중복 기록하지 않습니다.':'');box.querySelector('#admin-save-retry').hidden=!item;box.querySelector('#admin-save-retry').disabled=journal.busy();box.querySelector('#admin-save-dismiss').hidden=!!item;}
 var journal=lib.create({storage:store,api:X.A,changed:function(){notice='';render();}});root.MEGASPOT_ADMIN_SAVE=journal;
 box.querySelector('#admin-save-retry').onclick=function(){var item=journal.current();if(!item)return;journal.retry().then(function(){notice='저장 결과를 확인했습니다. 최신 정산 내역을 불러왔습니다.';root.dispatchEvent(new CustomEvent('admin-save-recovered',{detail:item}));}).catch(function(e){notice=e.message||'연결을 확인한 뒤 다시 시도해 주세요.';X.guard(e);if(!journal.current())root.dispatchEvent(new CustomEvent('admin-save-recovered',{detail:{...item,conflict:true}}));}).finally(render);};
 box.querySelector('#admin-save-dismiss').onclick=function(){notice='';render();};new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['class']});render();
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';var KEY='megaspot:admin-save:v1';
 function failure(code,message){var e=new Error(message);e.code=code;return e;}
 function create(options){
  var active=false,storage=options.storage;
  function current(){try{var item=JSON.parse(storage.getItem(KEY)||'null');if(item&&['payment','cancellation'].includes(item.kind)&&/^[A-Z0-9-]+$/.test(item.code)&&item.path==='/bookings/'+item.code+(item.kind==='cancellation'?'/cancellation':/\/settlement(?:\/entries\/\d+)?$/.exec(item.path)?.[0])&&/^[A-Za-z0-9_-]{8,80}$/.test(item.body?.request_id||''))return item;}catch{}return null;}
  function changed(){if(options.changed)options.changed();}
  function persist(item){try{storage.setItem(KEY,JSON.stringify(item));if(storage.getItem(KEY)!==JSON.stringify(item))throw Error();}catch{throw failure('SAVE_STORAGE_UNAVAILABLE','브라우저에 재시도 정보를 보관하지 못해 저장을 시작하지 않았습니다. 브라우저 저장 공간을 확인해 주세요.');}}
  function clear(id){if(current()?.body.request_id===id)storage.removeItem(KEY);}
  async function send(item){
   if(active)throw failure('SAVE_BUSY','저장 결과를 확인하는 중입니다.');active=true;changed();
   try{var result=await options.api(item.path,{method:'POST',body:JSON.parse(JSON.stringify(item.body))});clear(item.body.request_id);return result;}
   catch(e){if([400,404,409,413,422].includes(e.status)){clear(item.body.request_id);throw e;}if(e.status===401||e.status===403)throw e;throw failure('SAVE_UNCONFIRMED','저장 결과를 확인하지 못했습니다. 같은 내용으로 다시 저장하거나, 창을 닫고 상단의 저장 결과 확인을 눌러 주세요.');}
   finally{active=false;changed();}
  }
  async function submit(kind,code,path,body){
   var item=current(),next={version:1,kind:kind,code:code,path:path,body:JSON.parse(JSON.stringify(body))};
   if(item&&JSON.stringify(item)!==JSON.stringify(next))throw failure('SAVE_UNCONFIRMED','저장 결과가 확인되지 않은 요청이 있습니다. 창을 닫고 상단의 저장 결과 확인을 먼저 진행해 주세요.');
   if(!item){persist(next);item=next;}return send(item);
  }
  return {current:current,busy:function(){return active;},submit:submit,retry:function(){var item=current();if(!item)return Promise.reject(failure('NO_PENDING_SAVE','확인할 저장 요청이 없습니다.'));return send(item);}};
 }
 return {create:create,key:KEY};
});
