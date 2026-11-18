import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../assets/js/pages/admin-parking.js',import.meta.url),'utf8');
function fixture({type='manual_registered',reason='',confirmed=true,request=()=>Promise.resolve({ok:true}),refresh=()=>Promise.resolve()}={}){
 let focus=null,click;const requests=[],messages=[],events=[],status={hidden:true,textContent:'',focus(){focus='status';}};
 const fields=Object.fromEntries([['resolution_type',type],['resolution_memo',reason],['confirm_resolved',confirmed],['memo','기존 운영 메모']].map(([name,value])=>[name,{name,type:typeof value==='boolean'?'checkbox':'text',value:typeof value==='boolean'?'':value,checked:typeof value==='boolean'?value:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},focus(){focus=name;}}]));
 const card={dataset:{poid:'MSRESOLVE'},querySelector(selector){return selector==='[data-resolution-status]'?status:fields[selector.match(/name="([^"]+)"/)[1]];},querySelectorAll(selector){return selector.includes('aria-invalid')?Object.values(fields).filter(f=>f.attrs['aria-invalid']):Object.values(fields);}};
 const button={dataset:{pact:'resolve'},disabled:false,textContent:'관리자 확인 완료',closest:()=>card};
 const ctx=vm.createContext({items:[{oid:'MSRESOLVE',status:'issue',updated_at:'2026-11-18 02:00:00'}],dirty:true,$:()=>({addEventListener:(name,fn)=>click=fn}),api:(path,data)=>{requests.push({path,data});return request();},M:{toast:x=>messages.push(x)},load:refresh,document:{dispatchEvent:e=>events.push(e.type)},CustomEvent:class{constructor(type){this.type=type;}},failure:()=>assert.fail('resolution errors must stay beside the clicked button')});
 vm.runInContext(source.slice(source.indexOf(' function resolutionError('),source.indexOf(' function count(')),ctx);
 vm.runInContext(source.slice(source.indexOf(" $('#pa-list').addEventListener('click'"),source.indexOf(" $('#pa-clear-filters')")),ctx);
 return {fields,button,status,requests,messages,events,ctx,focus:()=>focus,click:()=>click({target:{closest:()=>button}})};
}
for(const [label,options,field,message] of [['type',{type:''},'resolution_type','처리 구분'],['confirmation',{reason:'수동 등록 확인',confirmed:false},'confirm_resolved','확인에 체크']])test('missing '+label+' shows an inline error, focuses the field and never sends a save request',async()=>{
 const f=fixture(options);await f.click();assert.equal(f.requests.length,0);assert.equal(f.button.disabled,false);assert.equal(f.status.hidden,false);assert.match(f.status.textContent,new RegExp(message));assert.equal(f.focus(),field);assert.equal(f.fields[field].attrs['aria-invalid'],'true');
});
test('successful save includes original row version, awaits refresh and updates badges via the parking event',async()=>{
 let saved=false,refreshed=false,release;const refresh=new Promise(r=>release=r);const f=fixture({reason:'아마노 수동 등록 완료 확인',request:async()=>{saved=true;return{ok:true};},refresh:async()=>{assert.equal(saved,true);await refresh;refreshed=true;}});const promise=f.click();await Promise.resolve();await Promise.resolve();assert.equal(f.button.disabled,true);assert.equal(f.button.textContent,'저장 중…');assert.equal(refreshed,false);release();await promise;
 assert.equal(f.requests.length,1);assert.equal(f.requests[0].path,'orders/MSRESOLVE/resolve');assert.equal(f.requests[0].data.expected_status,'issue');assert.equal(f.requests[0].data.expected_updated_at,'2026-11-18 02:00:00');assert.equal(f.requests[0].data.confirm_resolved,true);assert.equal(refreshed,true);assert.equal(f.ctx.dirty,false);assert.ok(f.events.includes('megaspot:parking-updated'));assert.match(f.messages[0],/처리 완료 목록/);assert.equal(f.button.disabled,false);assert.equal(f.button.textContent,'관리자 확인 완료');
});
test('a rejected save remains beside the button with all typed values intact and no false success or refresh',async()=>{
 const f=fixture({reason:'아마노 수동 등록 확인',request:async()=>{throw Error('다른 요청에서 상태가 변경되었습니다. 새로고침 후 확인해 주세요.');},refresh:()=>assert.fail('must not refresh and discard the reason')});await f.click();assert.equal(f.status.hidden,false);assert.match(f.status.textContent,/상태가 변경/);assert.equal(f.focus(),'status');assert.equal(f.fields.resolution_memo.value,'아마노 수동 등록 확인');assert.equal(f.fields.confirm_resolved.checked,true);assert.equal(f.messages.length,0);assert.equal(f.ctx.dirty,true);assert.equal(f.button.disabled,false);
});

test('blank or whitespace-only optional reason does not block save when type and confirmation are present',async()=>{
 for(const reason of ['', '   ']){const f=fixture({reason});await f.click();assert.equal(f.requests.length,1);assert.equal(f.requests[0].data.resolution_type,'manual_registered');assert.equal(f.requests[0].data.confirm_resolved,true);assert.equal(f.status.hidden,true);assert.equal(f.messages.length,1);}
});
