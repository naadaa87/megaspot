/* Private payment request: reads never create a PG request; checkout is an explicit action. */
(function(){
  'use strict';
  var $=function(id){return document.getElementById(id);};
  var token=new URLSearchParams(location.search).get('link')||'';
  var tokenOK=/^[A-Za-z0-9_-]{43}$/.test(token);
  var endpoint=tokenOK?'/api/payment-links/'+encodeURIComponent(token):'';
  var link=null,checking=false,payBusy=false,uncertain=false,readFailed=false,leaving=false;
  var serviceNames={rental:'공간 대관',catering:'출장뷔페',other:'기타 서비스'};
  var purposeNames={deposit:'예약금',balance:'잔금',full:'전체 금액'};
  var agreements=[$('pl-agree-terms'),$('pl-agree-privacy'),$('pl-agree-refund')];
  var stateCopy={
    open:['결제 전','안내된 내역을 확인하신 뒤 결제를 진행해 주세요.','→'],
    processing:['결제 진행 중','이미 요청한 결제가 있습니다. 처음 입력한 정보로 이어서 진행해 주세요.','↻'],
    paid:['결제 완료','결제 결과가 확인되었습니다. 예약 일정과 서비스 진행은 담당자 안내를 확인해 주세요.','✓'],
    refunded:['환불 확인','이 결제의 환불 내역이 확인되었습니다. 자세한 내용은 담당자에게 문의해 주세요.','✓'],
    closed:['종료된 결제 안내','이 결제 안내는 종료되었습니다. 담당자에게 새 안내를 요청해 주세요.','—'],
    expired:['결제 기한 만료','결제 기한이 지났습니다. 담당자에게 새 안내를 요청해 주세요.','—'],
    attention:['결제 확인 필요','결제 요청을 확인하고 있습니다. 다시 결제하지 말고 상태를 확인하거나 담당자에게 문의해 주세요.','!']
  };
  function text(id,value){$(id).textContent=value==null?'':String(value);}
  function money(value){return Number(value).toLocaleString('ko-KR');}
  function currentState(){var s=link&&(link.state||link.status);return Object.hasOwn(stateCopy,s)?s:'attention';}
  function canCheckout(){return !!link&&['open','processing'].includes(currentState())&&link.payment_enabled===true&&!checking&&!payBusy&&!uncertain&&!readFailed&&!leaving;}
  function row(id,value){$(id+'-row').hidden=value==null||value==='';text(id,value);}
  function dateLabel(raw){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw||''))return '';
    var p=raw.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));
    if(d.toISOString().slice(0,10)!==raw)return '';
    return p[0]+'.'+String(p[1]).padStart(2,'0')+'.'+String(p[2]).padStart(2,'0')+' ('+'일월화수목금토'[d.getUTCDay()]+')';
  }
  function hourLabel(value){
    if(value==null||value==='')return '';
    var n=Number(value);if(!Number.isFinite(n)||n<0||n>48)return '';
    var minutes=Math.round(n*60),hour=Math.floor(minutes/60);
    return (hour>=24?'다음 날 ':'')+String(hour%24).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  }
  function expiryLabel(raw){
    var d;
    if(typeof raw==='number'&&Number.isFinite(raw))d=new Date(raw);
    else{
      if(typeof raw!=='string'||!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(raw))return '';
      var iso=raw.replace(' ','T');if(!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso))iso+='Z';
      d=new Date(iso);
    }
    if(!Number.isFinite(d.getTime()))return '';
    var parts=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d),p={};
    parts.forEach(function(x){p[x.type]=x.value;});
    return p.year+'.'+p.month+'.'+p.day+' '+p.hour+':'+p.minute+' (한국 시간)';
  }
  function status(state,title,detail){
    var copy=stateCopy[state]||['안내 확인 필요','','!'];
    $('pl-status').dataset.state=state;
    $('pl-status').setAttribute('aria-busy',String(checking));
    text('pl-status-title',title||copy[0]);text('pl-status-detail',detail||copy[1]);text('pl-status-icon',copy[2]);
  }
  function error(message){text('pl-error',message);$('pl-error').hidden=!message;if(message)$('pl-error').focus();}
  function paintControls(){
    var possible=!!link&&['open','processing'].includes(currentState())&&link.payment_enabled===true&&!readFailed;
    $('pl-checkout').hidden=!possible;
    $('pl-fields').disabled=payBusy||checking||uncertain||readFailed||leaving;
    $('pl-pay').disabled=!canCheckout();
    $('pl-pay').setAttribute('aria-busy',String(payBusy));
    text('pl-pay-label',payBusy?'결제창을 준비하고 있습니다…':currentState()==='processing'?'기존 결제 이어가기':link?money(link.amount)+'원 결제하기':'결제하기');
    text('pl-buyer-help',currentState()==='processing'?'처음 결제를 요청한 이름·휴대폰 번호를 입력해 주세요.':'예약·상담 시 안내받은 정보로 입력해 주세요.');
    $('pl-refresh').disabled=checking||payBusy||leaving;$('pl-load-retry').disabled=checking||payBusy||leaving;
    if(uncertain&&!readFailed)status('attention','결제 요청 결과를 확인해 주세요','요청이 접수됐을 수 있습니다. 다시 결제하지 말고 아래의 상태 다시 확인을 눌러 주세요.');
  }
  function paintLink(){
    text('pl-title',link.title||'예약·결제 안내');text('pl-amount',money(link.amount));
    text('pl-reference',link.id||'—');
    text('pl-purpose-badge',purposeNames[link.purpose]||'결제');
    text('pl-service',(serviceNames[link.service]||'서비스')+' · '+(purposeNames[link.purpose]||'결제'));
    row('pl-space',link.space_name||'');row('pl-date',dateLabel(link.event_date));
    row('pl-people',Number.isInteger(Number(link.headcount))&&Number(link.headcount)>0?money(link.headcount)+'명':'');
    var start=hourLabel(link.start_h),end=hourLabel(link.end_h);
    row('pl-time',start&&end?start+' – '+end+' (한국 기준)':'');
    row('pl-booking',link.booking_code||'');row('pl-expiry',expiryLabel(link.expires_at));row('pl-order',link.oid||link.order_oid||'');
    row('pl-refund',Number(link.refunded_amount)>0?money(link.refunded_amount)+'원':'');
    text('pl-description',link.description||'');$('pl-description-section').hidden=!link.description;
    $('pl-service-guide').href=link.service==='catering'?'/catering/':link.service==='rental'?'/guide/':'/terms/';
    text('pl-service-guide',link.service==='catering'?'출장뷔페 이용 안내 보기 →':link.service==='rental'?'공간 이용 안내 보기 →':'이용약관 보기 →');
    $('pl-content').hidden=false;$('pl-load-error').hidden=true;
    var s=currentState();status(s);
    if(s==='paid'&&link.needs_review)status('paid','결제 완료 · 담당자 확인 중','결제는 완료되었습니다. 예약·서비스 내역을 담당자가 확인하고 있으니 다시 결제하지 말고 안내를 기다려 주세요.');
    if(['open','processing'].includes(s)&&link.payment_enabled!==true)status('attention','현재 결제를 진행할 수 없습니다','잠시 후 상태를 확인하거나 담당자에게 문의해 주세요.');
    paintControls();
  }
  function readApi(path,method,body){
    var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},method==='POST'?30000:12000);
    return fetch(path,{method:method,credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',redirect:'error',headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal}).then(function(r){
      if(!(r.headers.get('content-type')||'').includes('application/json'))throw Error('응답을 확인하지 못했습니다. 상태를 다시 확인해 주세요.');
      return r.json().then(function(j){if(!r.ok||j.ok!==true){var e=new Error(j.error||'요청을 처리하지 못했습니다. 상태를 확인하거나 담당자에게 문의해 주세요.');e.status=r.status;e.code=j.code;throw e;}return j;});
    }).finally(function(){clearTimeout(timer);});
  }
  function load(){
    if(!tokenOK){status('error','결제 안내 링크를 확인해 주세요','전달받으신 링크 전체를 다시 열거나 담당자에게 문의해 주세요.');$('pl-load-error').hidden=false;$('pl-load-retry').hidden=true;$('pl-status').setAttribute('aria-busy','false');return Promise.resolve();}
    if(checking||payBusy||leaving)return Promise.resolve();
    checking=true;paintControls();
    return readApi(endpoint,'GET').then(function(r){
      if(!r.link||!Number.isSafeInteger(r.link.amount)||r.link.amount<1000)throw Error('결제 안내 내용을 확인하지 못했습니다. 담당자에게 문의해 주세요.');
      link=r.link;uncertain=false;readFailed=false;error('');paintLink();
    }).catch(function(e){
      readFailed=true;status('error','결제 안내를 불러오지 못했습니다',e.status===404?'전달받으신 링크를 확인하거나 담당자에게 문의해 주세요.':'연결 상태를 확인한 뒤 다시 불러와 주세요. 결제를 마쳤다면 다시 결제하지 마세요.');
      $('pl-checkout').hidden=true;$('pl-load-error').hidden=false;
    }).finally(function(){checking=false;$('pl-status').setAttribute('aria-busy','false');paintControls();});
  }
  function payUrl(raw){
    try{var u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname==='payapp.kr'||u.hostname.endsWith('.payapp.kr')))return null;return u.href;}catch{return null;}
  }
  $('pl-agree-all').addEventListener('change',function(){agreements.forEach(function(input){input.checked=$('pl-agree-all').checked;});});
  agreements.forEach(function(input){input.addEventListener('change',function(){var all=agreements.every(function(x){return x.checked;});$('pl-agree-all').checked=all;$('pl-agree-all').indeterminate=!all&&agreements.some(function(x){return x.checked;});});});
  $('pl-phone').addEventListener('input',function(){var v=this.value.replace(/\D/g,'').slice(0,11);this.value=v.length>7?v.replace(/(\d{3})(\d{3,4})(\d{4})/,'$1-$2-$3'):v.length>3?v.slice(0,3)+'-'+v.slice(3):v;});
  $('pl-form').addEventListener('submit',function(event){
    event.preventDefault();if(!canCheckout())return;
    error('');if(!$('pl-form').reportValidity())return;
    var buyer={name:$('pl-name').value.trim(),phone:$('pl-phone').value.replace(/\D/g,''),email:$('pl-email').value.trim()};
    if(!buyer.name||buyer.name.length>40){error('결제자 이름을 입력해 주세요.');$('pl-name').focus();return;}
    if(!/^01[016789]\d{7,8}$/.test(buyer.phone)){error('휴대폰 번호를 확인해 주세요.');$('pl-phone').focus();return;}
    if(buyer.email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer.email)){error('이메일 주소를 확인해 주세요.');$('pl-email').focus();return;}
    if(!agreements.every(function(x){return x.checked;})){error('필수 내용을 확인하고 동의해 주세요.');return;}
    payBusy=true;paintControls();
    return readApi(endpoint+'/checkout','POST',{buyer:buyer,agree_terms:true,agree_privacy:true,agree_refund:true}).then(function(r){
      var url=payUrl(r.payurl);if(!url)throw Error('결제창 주소를 확인하지 못했습니다. 상태를 다시 확인해 주세요.');
      leaving=true;location.assign(url);
    }).catch(function(e){
      leaving=false;uncertain=!(e.status===400||e.status===422||e.code==='BUYER_MISMATCH');
      error(e.name==='AbortError'?'결제 요청 결과를 확인하지 못했습니다. 다시 결제하지 말고 상태를 확인해 주세요.':e.message||'결제 요청 결과를 확인해 주세요.');
    }).finally(function(){payBusy=false;paintControls();});
  });
  $('pl-refresh').addEventListener('click',load);$('pl-load-retry').addEventListener('click',load);
  window.addEventListener('pageshow',function(event){if(event.persisted){checking=false;payBusy=false;leaving=false;load();}});
  load();
})();
