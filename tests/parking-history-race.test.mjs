import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../assets/js/pages/parking-purchase.js',import.meta.url),'utf8');
function receiptLoader(api){
 const rendered=[],saved=[],errors=[],timers=[];
 const fields=new Map(),result={hidden:true,innerHTML:'',contains:()=>false,querySelectorAll:()=>[]};
 const field=id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id);};
 const ctx=vm.createContext({activeOid:'ORDER-A',activeKey:'key-a',activeBatch:false,unknownHistoryKind:false,receiptLoading:null,timer:null,
  form:{hidden:false},result,document:{activeElement:null,hidden:false,querySelector:()=>({})},$:field,
  api,keep:(...args)=>saved.push(args),receiptView:{render:r=>{const id=r.batch?r.payment.oid:r.order.oid;rendered.push(id);return id;}},
  today:()=> '2026-11-07',scheduleReceipt(){},error:msg=>errors.push(msg),clearTimeout(){},setTimeout:fn=>{timers.push(fn);return timers.length;}});
 vm.runInContext(source.slice(source.indexOf(' function loadReceipt(){'),source.indexOf(' var hash=')),ctx);
 return {ctx,rendered,saved,errors,timers,load:()=>ctx.loadReceipt()};
}
const single=oid=>({order:{oid,visit_date:'2026-11-07',payment_status:'paid',status:'applied'}});

test('다른 구매 링크로 전환하면 이전 진행 중 응답은 표시·저장하지 않고 최신 주문을 조회한다',async()=>{
 let finishA;const calls=[];
 const f=receiptLoader((path,body,key)=>{calls.push({path,key});return path==='orders/ORDER-A'?new Promise(resolve=>finishA=resolve):Promise.resolve(single('ORDER-B'));});
 const first=f.load();f.ctx.activeOid='ORDER-B';f.ctx.activeKey='key-b';f.load();
 finishA(single('ORDER-A'));await first;
 assert.deepEqual(calls,[{path:'orders/ORDER-A',key:'key-a'},{path:'orders/ORDER-B',key:'key-b'}]);
 assert.deepEqual(f.rendered,['ORDER-B']);assert.deepEqual(f.saved.map(x=>x.slice(0,2)),[['ORDER-B','key-b']]);assert.deepEqual(f.errors,[]);
});

test('레거시 통합 주문의 임시 조회 실패 뒤에도 batch 경로를 다시 확인한다',async()=>{
 let batches=0;const calls=[];
 const f=receiptLoader(path=>{calls.push(path);if(path.startsWith('orders/'))return Promise.reject(Object.assign(Error('단일 주문 없음'),{status:404}));if(++batches===1)return Promise.reject(Object.assign(Error('일시 오류'),{status:503}));return Promise.resolve({batch:true,payment:{oid:'ORDER-A'},items:[{visit_date:'2026-11-07'}]});});
 f.ctx.unknownHistoryKind=true;await f.load();assert.equal(f.ctx.unknownHistoryKind,true);assert.equal(f.errors[0],'일시 오류');
 await f.load();assert.deepEqual(calls,['orders/ORDER-A','batches/ORDER-A','orders/ORDER-A','batches/ORDER-A']);
 assert.equal(f.ctx.activeBatch,true);assert.equal(f.ctx.unknownHistoryKind,false);assert.deepEqual(f.rendered,['ORDER-A']);
});

test('이전 주문 요청이 실패해도 전환한 최신 링크의 화면에 오래된 오류를 남기지 않는다',async()=>{
 let rejectA;const f=receiptLoader(path=>path==='orders/ORDER-A'?new Promise((_,reject)=>rejectA=reject):Promise.resolve(single('ORDER-B')));
 const first=f.load();f.ctx.activeOid='ORDER-B';f.ctx.activeKey='key-b';rejectA(Error('이전 링크 오류'));await first;
 assert.deepEqual(f.errors,[]);assert.deepEqual(f.rendered,['ORDER-B']);
});

test('브라우저 저장이 불가능할 때 최초·추가 구매 링크의 보안 키를 URL에서 지우지 않는다',()=>{
 const oid='MS'+'A'.repeat(20),key='b'.repeat(64);
 for(const blocked of [true,false]){
  const navigated=[],loaded=[],ctx=vm.createContext({activeOid:oid,activeKey:key,activeBatch:false,unknownHistoryKind:false,config:{},
   hash:new URLSearchParams('oid='+oid+'&key='+key),URLSearchParams,encodeURIComponent,location:{hash:'#batch='+oid+'&key='+key},
   keep(){if(blocked)throw Error('Storage blocked');},history:{replaceState:(...args)=>navigated.push(args[2])},window:{addEventListener:(name,callback)=>ctx.hashChanged=callback},loadReceipt:()=>loaded.push(true)});
  vm.runInContext(source.slice(source.indexOf(" if(hash.get('key')"),source.indexOf(" api('config')")),ctx);
  assert.equal(navigated.length,blocked?0:1);
  vm.runInContext(source.slice(source.indexOf(" window.addEventListener('hashchange'"),source.indexOf(" document.addEventListener('visibilitychange'")),ctx);
  ctx.hashChanged();assert.equal(navigated.length,blocked?0:2);assert.equal(ctx.activeKey,key);assert.equal(ctx.activeBatch,true);assert.equal(loaded.length,1);
 }
});
