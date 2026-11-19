import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../assets/js/pages/admin-parking.js',import.meta.url),'utf8');
function fixture(api){
 const fields=new Map();const $=key=>{if(!fields.has(key))fields.set(key,{value:'',hidden:true,textContent:'',innerHTML:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;}});return fields.get(key);};
 $('#pa-filter').value='queue';const drawn=[],errors=[],ctx=vm.createContext({$,saveParkingFilters(){},encodeURIComponent,api,busy:false,loadAgain:false,listLoading:null,lastListQuery:'',items:[],listSort:'queue',draw:()=>drawn.push(ctx.items.map(p=>p.oid)),count:()=>{},failure:e=>errors.push(e.message)});
 vm.runInContext(source.slice(source.indexOf(' function selection(){'),source.indexOf(' function settings()')),ctx);return{$,ctx,drawn,errors,load:()=>ctx.load(),clear:()=>ctx.clearFilters()};
}
const result=(id,n=1)=>({items:Array.from({length:n},(_,i)=>({oid:id+i})),matched_count:n,sort:'applied_desc'});
test('loading中 queue→completed→all switches render only the final selection',async()=>{
 let finish;const calls=[];const f=fixture(path=>{calls.push(path);if(calls.length===1)return new Promise(r=>finish=r);return Promise.resolve(result('ALL',7));});
 const pending=f.load();f.$('#pa-filter').value='applied';f.load();f.$('#pa-filter').value='all';f.load();finish(result('STALE_QUEUE'));await pending;
 assert.deepEqual(calls,['orders?filter=queue&date=&q=','orders?filter=all&date=&q=']);assert.deepEqual(f.drawn,[Array.from({length:7},(_,i)=>'ALL'+i)]);assert.match(f.$('#pa-filter-summary').textContent,/전체 결제·주문 · 전체 이용일 · 필터 일치 7대/);assert.equal(f.$('#pa-list').attrs['aria-busy'],'false');
});
test('old request failure cannot hide a later completed result or leave an error',async()=>{
 let reject;const f=fixture(path=>path.includes('filter=queue')?new Promise((_,r)=>reject=r):Promise.resolve(result('DONE',7)));const pending=f.load();f.$('#pa-filter').value='applied';f.load();reject(Error('Old request failed'));await pending;assert.deepEqual(f.errors,[]);assert.deepEqual(f.drawn,[Array.from({length:7},(_,i)=>'DONE'+i)]);
});
test('clearing filters resets status, date and query to defaults',async()=>{
 const calls=[],f=fixture(path=>{calls.push(path);return Promise.resolve(result('DONE',7));});f.$('#pa-filter').value='applied';f.$('#pa-date').value='2026-11-16';f.$('#pa-search').value='single-order';await f.clear();assert.deepEqual(calls,['orders?filter=queue&date=&q=']);assert.equal(f.$('#pa-filter').value,'queue');assert.match(f.$('#pa-filter-summary').textContent,/전체 이용일/);
});
test('matching completed vehicles and sibling context are labelled separately, search text is not HTML',async()=>{
 const f=fixture(()=>Promise.resolve({...result('CAR',8),matched_count:7}));f.$('#pa-filter').value='applied';f.$('#pa-search').value='<img src=x>';await f.load();assert.match(f.$('#pa-filter-summary').textContent,/필터 일치 7대 · 함께 결제한 차량 1대 포함/);assert.match(f.$('#pa-filter-summary').textContent,/검색: <img src=x>/);assert.equal(f.$('#pa-filter-summary').innerHTML,'');
});
test('refresh during the same request is coalesced and cannot leave a loading state',async()=>{
 let finish;const calls=[],f=fixture(path=>{calls.push(path);return calls.length===1?new Promise(r=>finish=r):Promise.resolve(result('LATEST'));});const pending=f.load();f.load();f.load();finish(result('OLD'));await pending;assert.equal(calls.length,2);assert.deepEqual(f.drawn,[['LATEST0']]);assert.equal(f.$('#pa-list').attrs['aria-busy'],'false');
});
