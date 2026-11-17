(function(){
 'use strict';
 const $=id=>document.getElementById(id),form=$('feedback-form'),status=$('feedback-status');
 const token=new URLSearchParams(location.hash.slice(1)).get('feedback')||'';let consent='',busy=false;
 async function api(body){const r=await fetch('/api/feedback',{method:body?'POST':'GET',cache:'no-store',credentials:'omit',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.error||'잠시 후 다시 시도해 주세요.');return d;}
 function thanks(){form.hidden=true;status.textContent='';$('feedback-thanks').hidden=false;}
 if(!/^[A-Za-z0-9_-]{43}$/.test(token)){status.textContent='알림톡 또는 운영팀이 보내드린 예약별 설문 링크로 접속해 주세요.';return;}
 api().then(r=>{consent=r.consent_version;$('feedback-booking').textContent=r.booking.space+' · '+r.booking.date;$('feedback-booking').hidden=false;status.textContent='';if(r.submitted){thanks();return;}r.categories.forEach(c=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name='category';input.value=c;label.append(input,document.createTextNode(c));$('feedback-categories').append(label);});form.hidden=false;}).catch(e=>{status.textContent=e.message;});
 $('feedback-categories').addEventListener('change',e=>{const input=e.target;if(!input.checked)return;form.querySelectorAll('[name="category"]').forEach(other=>{if(other!==input&&(input.value==='없음'||other.value==='없음'))other.checked=false;});});
 $('feedback-body').addEventListener('input',()=>{$('feedback-count').textContent=$('feedback-body').value.length;});
 form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;const d=new FormData(form),categories=d.getAll('category');if(!categories.length){status.textContent='개선이 필요한 부분을 선택해 주세요. 없으면 ‘없음’을 선택해 주세요.';$('feedback-categories').querySelector('input').focus();return;}busy=true;$('feedback-submit').disabled=true;status.textContent='의견을 보내고 있습니다.';try{await api({rating:Number(d.get('rating')),categories,body:d.get('body'),contact_requested:d.get('contact')==='yes',agree:d.get('agree')==='on',consent_version:consent});thanks();$('feedback-thanks').scrollIntoView({behavior:'smooth',block:'center'});}catch(ex){status.textContent=ex.message;}finally{busy=false;$('feedback-submit').disabled=false;}});
})();
